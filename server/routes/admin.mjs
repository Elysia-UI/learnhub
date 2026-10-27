import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.mjs';
import { role, validate, uid, assert } from '../security.mjs';
import { audit, award, notify } from '../services/activity.mjs';
import { stats } from '../services/snapshot.mjs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { storageDir } from '../config.mjs';
export const adminRoutes = Router();
adminRoutes.use(role('admin'));
adminRoutes.get('/stats', async (_req, res) => res.json({ data: await stats() }));
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
adminRoutes.post('/notices', async (req, res) => {
  const v = validate(
      z
        .object({
          title: z.string().trim().min(4).max(100),
          content: z.string().trim().min(10).max(20000),
          type: z.enum(['公告', '活动', '更新']),
        })
        .strict(),
      req.body,
    ),
    id = uid('notice');
  await transaction(async (c) => {
    await query(
      'INSERT INTO announcements(id,title,content,type) VALUES(?,?,?,?)',
      [id, v.title, v.content, v.type],
      c,
    );
    await audit(c, req.user.id, `发布公告：${v.title}`);
  });
  res.status(201).json({ data: { id } });
});
adminRoutes.patch('/notices/:id', async (req, res) => {
  const { pinned } = validate(z.object({ pinned: z.boolean() }).strict(), req.body);
  await transaction(async (c) => {
    await query('UPDATE announcements SET pinned=? WHERE id=?', [pinned, req.params.id], c);
    await audit(c, req.user.id, `切换公告置顶：${req.params.id}`);
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
