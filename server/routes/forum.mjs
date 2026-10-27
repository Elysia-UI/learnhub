import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.mjs';
import {
  auth,
  validate,
  tagsSchema,
  idSchema,
  uid,
  assert,
  owner,
  pageParams,
} from '../security.mjs';
import { postsDTO } from '../services/snapshot.mjs';
import { award, notify, audit, once } from '../services/activity.mjs';
export const forumRoutes = Router();
const inputSchema = z
  .object({
    title: z.string().trim().min(6, '标题至少 6 个字').max(100),
    content: z.string().trim().min(20, '正文至少 20 个字').max(50000),
    category: idSchema,
    tags: tagsSchema,
    type: z.enum(['讨论', '分享', '求助', '资源推荐']),
    image: z
      .string()
      .max(512)
      .optional()
      .refine(
        (v) =>
          !v ||
          /^\/(?:images\/(?:community\/)?|api\/uploads\/)[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(
            v,
          ),
        '图片地址无效',
      ),
  })
  .strict();
async function postRecord(id, req, conn) {
  const [p] = await query('SELECT * FROM posts WHERE id=?', [id], conn);
  assert(p, 404, '帖子不存在');
  assert(
    p.status === 'published' || p.author_id === req.user?.id || req.user?.role === 'admin',
    404,
    '帖子不存在',
  );
  return p;
}
forumRoutes.get('/categories', async (_req, res) => {
  const rows = await query(
    "SELECT c.*,(SELECT COUNT(*) FROM posts p WHERE p.category_id=c.id AND p.status='published') AS postCount FROM categories c ORDER BY id",
  );
  res.json({ data: rows.map((c) => ({ ...c, enabled: !!c.enabled })) });
});
forumRoutes.get('/posts', async (req, res) => {
  const f = pageParams(req.query),
    where = ["p.status='published'"],
    args = [];
  if (f.category !== 'all') {
    where.push('p.category_id=?');
    args.push(f.category);
  }
  if (f.q) {
    where.push('(p.title LIKE ? OR p.content LIKE ? OR CAST(p.tags AS CHAR) LIKE ?)');
    args.push(...Array(3).fill(`%${f.q}%`));
  }
  if (f.sort === 'featured') where.push('p.featured=1');
  const condition = where.join(' AND '),
    [n] = await query(`SELECT COUNT(*) AS n FROM posts p WHERE ${condition}`, args);
  const order =
    f.sort === 'hot'
      ? '(p.views+(SELECT COUNT(*) FROM post_likes l WHERE l.post_id=p.id)*10) DESC'
      : 'p.created_at DESC';
  const rows = await query(
    `SELECT p.* FROM posts p WHERE ${condition} ORDER BY p.pinned DESC,${order},p.id LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    args,
  );
  const ids = [...new Set(rows.map((r) => r.author_id))];
  const { publicUser } = await import('../security.mjs');
  res.json({
    data: {
      items: await postsDTO(rows),
      users: ids.length
        ? (await query(`SELECT * FROM users WHERE id IN (${ids.map(() => '?')})`, ids)).map(
            publicUser,
          )
        : [],
      total: n.n,
      page: f.page,
      pageSize: f.pageSize,
    },
  });
});
forumRoutes.get('/posts/:id', async (req, res) => {
  const p = await postRecord(req.params.id, req);
  res.json({ data: (await postsDTO([p]))[0] });
});
forumRoutes.post('/posts/:id/view', async (req, res) => {
  await transaction(async (c) => {
    await postRecord(req.params.id, req, c);
    if (req.user) {
      const result = await query(
        'INSERT IGNORE INTO browsing_history(user_id,post_id) VALUES(?,?)',
        [req.user.id, req.params.id],
        c,
      );
      if (result.affectedRows)
        await query('UPDATE posts SET views=views+1 WHERE id=?', [req.params.id], c);
      else
        await query(
          'UPDATE browsing_history SET visited_at=UTC_TIMESTAMP(3) WHERE user_id=? AND post_id=?',
          [req.user.id, req.params.id],
          c,
        );
    } else await query('UPDATE posts SET views=views+1 WHERE id=?', [req.params.id], c);
  });
  res.json({ data: { ok: true } });
});
forumRoutes.post('/posts', auth, async (req, res) => {
  const v = validate(inputSchema, req.body);
  assert(
    (await query('SELECT id FROM categories WHERE id=? AND enabled=1', [v.category])).length,
    400,
    '分类不存在',
  );
  const result = await transaction(async (c) =>
    once(req, c, async () => {
      const id = uid('post'),
        status = req.user.role === 'admin' ? 'published' : 'pending';
      await query(
        'INSERT INTO posts(id,author_id,category_id,title,content,tags,type,image,status) VALUES(?,?,?,?,?,?,?,?,?)',
        [
          id,
          req.user.id,
          v.category,
          v.title,
          v.content,
          JSON.stringify(v.tags),
          v.type,
          v.image || null,
          status,
        ],
        c,
      );
      if (status === 'published') await award(c, req.user.id, 'post', `post:${id}`, '发布帖子');
      return { id, status };
    }),
  );
  res.status(201).json({ data: result });
});
forumRoutes.patch('/posts/:id', auth, async (req, res) => {
  const v = validate(inputSchema, req.body),
    p = await postRecord(req.params.id, req);
  owner(req, p.author_id);
  assert(
    (await query('SELECT id FROM categories WHERE id=? AND enabled=1', [v.category])).length,
    400,
    '分类不存在',
  );
  await query(
    "UPDATE posts SET category_id=?,title=?,content=?,tags=?,type=?,image=?,status=?,review_reason='' WHERE id=?",
    [
      v.category,
      v.title,
      v.content,
      JSON.stringify(v.tags),
      v.type,
      v.image || null,
      req.user.role === 'admin' ? p.status : 'pending',
      p.id,
    ],
  );
  res.json({ data: { id: p.id, status: req.user.role === 'admin' ? p.status : 'pending' } });
});
forumRoutes.delete('/posts/:id', auth, async (req, res) => {
  const p = await postRecord(req.params.id, req);
  owner(req, p.author_id);
  await transaction(async (c) => {
    await query('DELETE FROM posts WHERE id=?', [p.id], c);
    if (req.user.role === 'admin') await audit(c, req.user.id, `删除帖子：${p.title}`);
  });
  res.json({ data: { ok: true } });
});
forumRoutes.post('/posts/:id/comments', auth, async (req, res) => {
  const v = validate(
      z
        .object({ content: z.string().trim().min(2).max(5000), parentId: idSchema.optional() })
        .strict(),
      req.body,
    ),
    p = await postRecord(req.params.id, req);
  assert(p.status === 'published', 409, '帖子通过审核后才能评论');
  if (v.parentId)
    assert(
      (await query('SELECT id FROM post_comments WHERE id=? AND post_id=?', [v.parentId, p.id]))
        .length,
      400,
      '回复的评论不属于当前帖子',
    );
  const id = uid('comment');
  const result = await transaction(async (c) =>
    once(req, c, async () => {
      await query(
        'INSERT INTO post_comments(id,post_id,author_id,parent_id,content) VALUES(?,?,?,?,?)',
        [id, p.id, req.user.id, v.parentId || null, v.content],
        c,
      );
      await notify(
        c,
        p.author_id,
        req.user.id,
        '你的帖子有了新评论',
        v.content,
        'comment',
        `/forum/${p.id}`,
      );
      if (v.parentId) {
        const [parent] = await query(
          'SELECT author_id FROM post_comments WHERE id=?',
          [v.parentId],
          c,
        );
        if (parent.author_id !== p.author_id)
          await notify(
            c,
            parent.author_id,
            req.user.id,
            '你的评论有了新回复',
            v.content,
            'reply',
            `/forum/${p.id}`,
          );
      }
      return { id };
    }),
  );
  res.status(201).json({ data: result });
});
forumRoutes.delete('/comments/:id', auth, async (req, res) => {
  const [c] = await query('SELECT * FROM post_comments WHERE id=?', [req.params.id]);
  assert(c, 404, '评论不存在');
  owner(req, c.author_id);
  await transaction(async (conn) => {
    await query('DELETE FROM post_comments WHERE id=?', [c.id], conn);
    if (req.user.role === 'admin') await audit(conn, req.user.id, `删除评论：${c.id}`);
  });
  res.json({ data: { ok: true } });
});
for (const kind of ['like', 'favorite'])
  forumRoutes.put(`/posts/:id/${kind}`, auth, async (req, res) => {
    const { active } = validate(z.object({ active: z.boolean() }).strict(), req.body),
      p = await postRecord(req.params.id, req),
      table = kind === 'like' ? 'post_likes' : 'post_favorites';
    assert(p.status === 'published', 409, '帖子通过审核后才能互动');
    await transaction(async (c) => {
      if (active) {
        const result = await query(
          `INSERT IGNORE INTO ${table}(post_id,user_id) VALUES(?,?)`,
          [p.id, req.user.id],
          c,
        );
        if (kind === 'like' && result.affectedRows)
          await notify(
            c,
            p.author_id,
            req.user.id,
            '你的帖子收到了点赞',
            p.title,
            'like',
            `/forum/${p.id}`,
          );
      } else
        await query(`DELETE FROM ${table} WHERE post_id=? AND user_id=?`, [p.id, req.user.id], c);
    });
    res.json({ data: { active } });
  });
