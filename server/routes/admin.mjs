import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.mjs';
import { role, validate, uid, assert, pageParams, publicUser } from '../security.mjs';
import { audit, award, notify, changePoints } from '../services/activity.mjs';
import { stats } from '../services/snapshot.mjs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { storageDir } from '../config.mjs';
export const adminRoutes = Router();
adminRoutes.use(role('admin'));
adminRoutes.get('/stats', async (_req, res) => res.json({ data: await stats() }));
adminRoutes.get('/activity', async (_req, res) => {
  const rows = await query(`SELECT day,kind,COUNT(*) AS count FROM (
    SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'),'%Y-%m-%d') AS day,'posts' AS kind FROM posts
    UNION ALL SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'),'%Y-%m-%d'),'questions' FROM questions
  ) a WHERE day>=DATE_FORMAT(DATE_SUB(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+08:00'),INTERVAL 6 DAY),'%Y-%m-%d') GROUP BY day,kind`);
  res.json({ data: rows });
});
for (const [kind, table, select, join] of [
  ['notices', 'announcements', 't.*', ''],
  ['comments', 'post_comments', 't.*,p.title AS post_title', 'JOIN posts p ON p.id=t.post_id'],
  ['logs', 'admin_operation_logs', 't.*', ''],
])
  adminRoutes.get('/lists/' + kind, async (req, res) => {
    const f = pageParams(req.query),
      field = kind === 'notices' ? 't.title' : kind === 'comments' ? 't.content' : 't.action';
    const where = f.q ? `${field} LIKE ?` : '1=1',
      args = f.q ? [`%${f.q}%`] : [],
      [n] = await query(`SELECT COUNT(*) AS n FROM ${table} t ${join} WHERE ${where}`, args);
    const rows = await query(
      `SELECT ${select} FROM ${table} t ${join} WHERE ${where} ORDER BY t.created_at DESC,t.id LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
      args,
    );
    const items = rows.map((r) =>
      kind === 'notices'
        ? {
            id: r.id,
            title: r.title,
            content: r.content,
            type: r.type,
            status: r.status,
            pinned: !!r.pinned,
            createdAt: r.created_at,
          }
        : kind === 'comments'
          ? {
              id: r.id,
              authorId: r.author_id,
              content: r.content,
              createdAt: r.created_at,
              post: { id: r.post_id, title: r.post_title },
            }
          : { id: r.id, actorId: r.actor_id, action: r.action, createdAt: r.created_at },
    );
    const ids = [...new Set(rows.map((r) => r.author_id || r.actor_id).filter(Boolean))];
    res.json({
      data: {
        items,
        total: Number(n.n),
        users: ids.length
          ? (await query(`SELECT * FROM users WHERE id IN (${ids.map(() => '?')})`, ids)).map(
              publicUser,
            )
          : [],
      },
    });
  });
adminRoutes.get('/users', async (_req, res) =>
  res.json({
    data: await query(
      'SELECT id,email,name,role,status,points,created_at FROM users ORDER BY created_at LIMIT 500',
    ),
  }),
);
adminRoutes.patch('/users/:id', async (req, res) => {
  const v = validate(
    z
      .object({
        role: z.enum(['student', 'teacher', 'admin']).optional(),
        status: z.enum(['active', 'banned']).optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0),
    req.body,
  );
  assert(req.params.id !== req.user.id, 400, '不能修改当前管理员的角色或状态');
  assert(
    (await query('SELECT id FROM users WHERE id=?', [req.params.id])).length,
    404,
    '用户不存在',
  );
  await transaction(async (c) => {
    await query(
      'UPDATE users SET role=COALESCE(?,role),status=COALESCE(?,status) WHERE id=?',
      [v.role || null, v.status || null, req.params.id],
      c,
    );
    if (v.status === 'banned' || v.role)
      await query('DELETE FROM sessions WHERE user_id=?', [req.params.id], c);
    await audit(c, req.user.id, `更新用户 ${req.params.id}：${JSON.stringify(v)}`);
  });
  res.json({ data: { ok: true } });
});
adminRoutes.patch('/posts/:id', async (req, res) => {
  const v = validate(
    z.object({ pinned: z.boolean().optional(), featured: z.boolean().optional() }).strict(),
    req.body,
  );
  await transaction(async (c) => {
    const r = await query(
      'UPDATE posts SET pinned=COALESCE(?,pinned),featured=COALESCE(?,featured) WHERE id=?',
      [v.pinned ?? null, v.featured ?? null, req.params.id],
      c,
    );
    assert(r.affectedRows, 404, '帖子不存在');
    await audit(c, req.user.id, `设置帖子 ${req.params.id}：${JSON.stringify(v)}`);
  });
  res.json({ data: { ok: true } });
});
adminRoutes.post('/posts/:id/review', async (req, res) => {
  const v = validate(
    z.object({ approved: z.boolean(), reason: z.string().trim().max(500).default('') }).strict(),
    req.body,
  );
  assert(v.approved || v.reason.length >= 2, 400, '驳回时请填写原因');
  await transaction(async (c) => {
    const [p] = await query('SELECT * FROM posts WHERE id=? FOR UPDATE', [req.params.id], c);
    assert(p, 404, '帖子不存在');
    const status = v.approved ? 'published' : 'rejected';
    if (p.status === status) return;
    await query(
      'UPDATE posts SET status=?,review_reason=?,reviewed_at=UTC_TIMESTAMP(3) WHERE id=?',
      [status, v.reason, p.id],
      c,
    );
    if (v.approved) await award(c, p.author_id, 'post', `post:${p.id}`, '帖子通过审核');
    await notify(
      c,
      p.author_id,
      req.user.id,
      v.approved ? '帖子审核通过' : '帖子被驳回',
      v.reason || p.title,
      'review',
      `/forum/${p.id}`,
    );
    await audit(c, req.user.id, `${v.approved ? '通过' : '驳回'}帖子：${p.title} ${v.reason}`);
  });
  res.json({ data: { ok: true } });
});
adminRoutes.post('/resources/:id/review', async (req, res) => {
  const { approved } = validate(z.object({ approved: z.boolean() }).strict(), req.body);
  await transaction(async (c) => {
    const [r] = await query('SELECT * FROM resources WHERE id=? FOR UPDATE', [req.params.id], c);
    assert(r, 404, '资源不存在');
    assert(r.status === 'pending', 409, '资源已经审核过了');
    await query(
      'UPDATE resources SET status=? WHERE id=?',
      [approved ? 'approved' : 'rejected', r.id],
      c,
    );
    if (approved) await award(c, r.author_id, 'resource', `resource:${r.id}`, '分享资源通过审核');
    await notify(
      c,
      r.author_id,
      req.user.id,
      approved ? '资源审核已通过' : '资源未通过审核',
      r.title,
      'resource',
      '/profile?tab=resources',
    );
    await audit(c, req.user.id, `${approved ? '通过' : '拒绝'}资源：${r.title}`);
  });
  res.json({ data: { ok: true } });
});
for (const [entity, table] of [
  ['courses', 'courses'],
  ['resources', 'resources'],
  ['questions', 'questions'],
  ['notices', 'announcements'],
])
  adminRoutes.delete(`/${entity}/:id`, async (req, res) => {
    let storedFile;
    await transaction(async (c) => {
      if (entity === 'questions') {
        const [q] = await query(
          'SELECT * FROM questions WHERE id=? FOR UPDATE',
          [req.params.id],
          c,
        );
        if (q?.bounty_status === 'held')
          await changePoints(
            c,
            q.author_id,
            q.bounty,
            `bounty-refund:${q.id}`,
            '问题删除，退还悬赏',
          );
      }
      if (entity === 'resources') {
        const [resource] = await query(
          'SELECT storage_key FROM resources WHERE id=? FOR UPDATE',
          [req.params.id],
          c,
        );
        assert(resource, 404, '内容不存在');
        storedFile = path.resolve(storageDir, resource.storage_key);
        assert(storedFile.startsWith(storageDir + path.sep), 400, '文件路径无效');
      }
      const result = await query(`DELETE FROM ${table} WHERE id=?`, [req.params.id], c);
      assert(result.affectedRows, 404, '内容不存在');
      await audit(c, req.user.id, `删除 ${entity}：${req.params.id}`);
    });
    if (storedFile) {
      try {
        await unlink(storedFile);
      } catch (error) {
        if (error.code !== 'ENOENT')
          console.error(
            JSON.stringify({
              code: error.code,
              message: 'Private file cleanup failed',
              requestId: req.requestId,
            }),
          );
      }
    }
    res.json({ data: { ok: true } });
  });
adminRoutes.post('/categories', async (req, res) => {
  const v = validate(
      z
        .object({ name: z.string().trim().min(2).max(20), description: z.string().trim().max(100) })
        .strict(),
      req.body,
    ),
    id = uid('category');
  await transaction(async (c) => {
    await query(
      "INSERT INTO categories(id,name,icon,color,description) VALUES(?,?,'BookOpen','#6366f1',?)",
      [id, v.name, v.description],
      c,
    );
    await audit(c, req.user.id, `添加分类：${v.name}`);
  });
  res.status(201).json({ data: { id } });
});
adminRoutes.delete('/categories/:id', async (req, res) => {
  await transaction(async (c) => {
    const [n] = await query(
      'SELECT (SELECT COUNT(*) FROM posts WHERE category_id=?)+(SELECT COUNT(*) FROM courses WHERE category_id=?)+(SELECT COUNT(*) FROM questions WHERE category_id=?)+(SELECT COUNT(*) FROM resources WHERE category_id=?) AS n',
      Array(4).fill(req.params.id),
      c,
    );
    assert(n.n === 0, 409, '分类下还有内容，不能删除');
    await query('DELETE FROM categories WHERE id=?', [req.params.id], c);
    await audit(c, req.user.id, `删除分类：${req.params.id}`);
  });
  res.json({ data: { ok: true } });
});
adminRoutes.patch('/categories/:id', async (req, res) => {
  const v = validate(
    z
      .object({
        name: z.string().trim().min(2).max(20).optional(),
        description: z.string().trim().max(100).optional(),
        enabled: z.boolean().optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length),
    req.body,
  );
  await transaction(async (c) => {
    const result = await query(
      'UPDATE categories SET name=COALESCE(?,name),description=COALESCE(?,description),enabled=COALESCE(?,enabled) WHERE id=?',
      [v.name ?? null, v.description ?? null, v.enabled ?? null, req.params.id],
      c,
    );
    assert(result.affectedRows, 404, '分类不存在');
    await audit(c, req.user.id, `编辑分类 ${req.params.id}：${JSON.stringify(v)}`);
  });
  res.json({ data: { ok: true } });
});
adminRoutes.post('/notices', async (req, res) => {
  const v = validate(
      z
        .object({
          title: z.string().trim().min(4).max(100),
          content: z.string().trim().min(10).max(20000),
          type: z.enum(['公告', '活动', '更新']),
          status: z.enum(['draft', 'published']).default('published'),
          pinned: z.boolean().default(false),
        })
        .strict(),
      req.body,
    ),
    id = uid('notice');
  await transaction(async (c) => {
    await query(
      'INSERT INTO announcements(id,title,content,type,status,pinned) VALUES(?,?,?,?,?,?)',
      [id, v.title, v.content, v.type, v.status, v.pinned],
      c,
    );
    await audit(c, req.user.id, `发布公告：${v.title}`);
  });
  res.status(201).json({ data: { id } });
});
adminRoutes.patch('/notices/:id', async (req, res) => {
  const v = validate(
    z
      .object({
        pinned: z.boolean().optional(),
        title: z.string().trim().min(4).max(100).optional(),
        content: z.string().trim().min(10).max(20000).optional(),
        type: z.enum(['公告', '活动', '更新']).optional(),
        status: z.enum(['draft', 'published']).optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length),
    req.body,
  );
  await transaction(async (c) => {
    const result = await query(
      'UPDATE announcements SET pinned=COALESCE(?,pinned),title=COALESCE(?,title),content=COALESCE(?,content),type=COALESCE(?,type),status=COALESCE(?,status) WHERE id=?',
      [
        v.pinned ?? null,
        v.title ?? null,
        v.content ?? null,
        v.type ?? null,
        v.status ?? null,
        req.params.id,
      ],
      c,
    );
    assert(result.affectedRows, 404, '公告不存在');
    await audit(c, req.user.id, `编辑公告：${req.params.id}`);
  });
  res.json({ data: { ok: true } });
});
adminRoutes.patch('/point-rules', async (req, res) => {
  const v = validate(
    z
      .object({
        code: z.enum(['checkin', 'post', 'answer', 'accepted', 'resource']),
        amount: z.number().int().min(0).max(100),
      })
      .strict(),
    req.body,
  );
  await transaction(async (c) => {
    await query('UPDATE point_rules SET amount=? WHERE code=?', [v.amount, v.code], c);
    await audit(c, req.user.id, `修改积分 ${v.code}：${v.amount}`);
  });
  res.json({ data: { ok: true } });
});
