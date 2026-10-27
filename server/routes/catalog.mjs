import { Router } from 'express';
import { query, iso } from '../db.mjs';
import { auth, role, pageParams, publicUser, assert } from '../security.mjs';
import { postsDTO, coursesDTO, questionsDTO, resourcesDTO } from '../services/snapshot.mjs';
export const catalogRoutes = Router();
const entities = {
  posts: {
    table: 'posts',
    type: '帖子',
    dto: postsDTO,
    public: "t.status='published'",
    author: 'author_id',
    text: 't.title,t.content,CAST(t.tags AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci',
    hot: 't.views',
  },
  questions: {
    table: 'questions',
    type: '问答',
    dto: questionsDTO,
    public: '1=1',
    author: 'author_id',
    text: 't.title,t.content,CAST(t.tags AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci',
    hot: 't.views',
  },
  courses: {
    table: 'courses',
    type: '课程',
    dto: coursesDTO,
    public: '1=1',
    author: 'teacher_id',
    text: 't.title,t.description,CAST(t.tags AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci',
    hot: '(SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id=t.id)',
  },
  resources: {
    table: 'resources',
    type: '资源',
    dto: resourcesDTO,
    public: "t.status='approved'",
    author: 'author_id',
    text: 't.title,t.description,CAST(t.tags AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci',
    hot: 't.downloads',
  },
  users: {
    table: 'users',
    type: '用户',
    dto: async (rows) => rows.map(publicUser),
    public: "t.status='active'",
    text: 't.name,t.bio',
    hot: 't.points',
  },
};
async function people(items) {
  const ids = new Set();
  for (const i of items) {
    for (const id of [
      i.authorId,
      i.teacherId,
      ...(i.comments || []).map((c) => c.authorId),
      ...(i.answers || []).flatMap((a) => [a.authorId, ...a.comments.map((c) => c.authorId)]),
    ])
      if (id) ids.add(id);
  }
  return ids.size
    ? (await query(`SELECT * FROM users WHERE id IN (${[...ids].map(() => '?')})`, [...ids])).map(
        publicUser,
      )
    : [];
}
export async function listEntity(
  kind,
  req,
  { scope = 'public', extra = '', args: extraArgs = [] } = {},
) {
  const spec = entities[kind];
  assert(spec, 404, '内容类型不存在');
  const f = pageParams(req.query),
    args = [...extraArgs],
    where = [extra || '1=1'];
  if (scope === 'public') where.push(spec.public);
  if (scope === 'mine') {
    where.push(`t.${spec.author || 'id'}=?`);
    args.push(req.user.id);
  }
  if (f.category !== 'all' && kind !== 'users') {
    where.push('t.category_id=?');
    args.push(f.category);
  }
  if (f.q) {
    where.push(`CONCAT_WS(' ',${spec.text}) LIKE ?`);
    args.push(`%${f.q.replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (
    scope === 'admin' &&
    req.query.status &&
    ['published', 'pending', 'rejected', 'approved', 'active', 'banned'].includes(
      String(req.query.status),
    ) &&
    ['posts', 'resources', 'users'].includes(kind)
  ) {
    where.push('t.status=?');
    args.push(req.query.status);
  }
  if (kind === 'questions' && req.query.answered === 'no')
    where.push('NOT EXISTS(SELECT 1 FROM answers a WHERE a.question_id=t.id)');
  if (kind === 'questions' && req.query.solved === 'yes')
    where.push('t.accepted_answer_id IS NOT NULL');
  if (kind === 'questions' && req.query.solved === 'no') where.push('t.accepted_answer_id IS NULL');
  if (kind === 'courses' && ['入门', '进阶', '通用'].includes(String(req.query.level))) {
    where.push('t.level=?');
    args.push(req.query.level);
  }
  if (kind === 'resources' && req.query.format && String(req.query.format).length <= 20) {
    where.push('t.type=?');
    args.push(req.query.format);
  }
  if (f.sort === 'featured' && ['posts', 'courses'].includes(kind)) where.push('t.featured=1');
  const condition = where.join(' AND '),
    [count] = await query(`SELECT COUNT(*) AS n FROM ${spec.table} t WHERE ${condition}`, args);
  const order =
    f.sort === 'hot'
      ? `${spec.hot} DESC,`
      : kind === 'courses' && req.query.recommended === 'true'
        ? 't.featured DESC,t.rating DESC,'
        : '';
  const rows = await query(
    `SELECT t.* FROM ${spec.table} t WHERE ${condition} ORDER BY ${order}t.created_at DESC,t.id LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    args,
  );
  const items = await spec.dto(rows);
  return {
    items,
    total: Number(count.n),
    page: f.page,
    pageSize: f.pageSize,
    users: await people(items),
  };
}
catalogRoutes.get('/search', async (req, res) => {
  const f = pageParams(req.query),
    type = String(req.query.type || '全部');
  assert(
    type === '全部' || Object.values(entities).some((s) => s.type === type),
    400,
    '搜索类型无效',
  );
  const counts = {},
    pieces = [],
    args = [];
  if (!f.q.trim())
    return res.json({
      data: { items: [], total: 0, counts, page: f.page, pageSize: f.pageSize, users: [] },
    });
  const term = `%${f.q.trim().replace(/[\\%_]/g, '\\$&')}%`;
  for (const [kind, spec] of Object.entries(entities)) {
    const condition = `${spec.public} AND CONCAT_WS(' ',${spec.text}) LIKE ?`;
    const [n] = await query(`SELECT COUNT(*) AS n FROM ${spec.table} t WHERE ${condition}`, [term]);
    counts[spec.type] = Number(n.n);
    if (type === '全部' || type === spec.type) {
      pieces.push(
        `SELECT t.id,'${kind}' AS kind,t.created_at,${spec.hot} AS score FROM ${spec.table} t WHERE ${condition}`,
      );
      args.push(term);
    }
  }
  const hits = await query(
    `SELECT * FROM (${pieces.join(' UNION ALL ')}) hits ORDER BY ${f.sort === 'hot' ? 'score DESC,' : ''}created_at DESC,id LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    args,
  );
  const items = [];
  for (const hit of hits) {
    const spec = entities[hit.kind],
      rows = await query(`SELECT * FROM ${spec.table} WHERE id=?`, [hit.id]);
    items.push({ type: spec.type, item: (await spec.dto(rows))[0] });
  }
  res.json({
    data: {
      items,
      counts,
      total: type === '全部' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[type],
      page: f.page,
      pageSize: f.pageSize,
      users: await people(items.map((i) => i.item)),
    },
  });
});
for (const kind of ['courses', 'questions', 'resources']) {
  catalogRoutes.get(`/${kind}`, async (req, res) =>
    res.json({ data: await listEntity(kind, req) }),
  );
  catalogRoutes.get(`/${kind}/:id`, async (req, res) => {
    const spec = entities[kind],
      [row] = await query(`SELECT * FROM ${spec.table} WHERE id=?`, [req.params.id]);
    assert(
      row &&
        (kind !== 'resources' ||
          row.status === 'approved' ||
          row.author_id === req.user?.id ||
          req.user?.role === 'admin'),
      404,
      '内容不存在',
    );
    const [item] = await spec.dto([row]);
    res.json({ data: { item, users: await people([item]) } });
  });
}
catalogRoutes.get('/members/:id', async (req, res) => {
  const [u] = await query("SELECT * FROM users WHERE id=? AND status='active'", [req.params.id]);
  assert(u, 404, '用户不存在');
  const [stats] = await query(
    "SELECT (SELECT COUNT(*) FROM posts WHERE author_id=? AND status='published') AS posts,(SELECT COUNT(*) FROM post_likes l JOIN posts p ON p.id=l.post_id WHERE p.author_id=? AND p.status='published') AS likes",
    [u.id, u.id],
  );
  res.json({ data: { ...publicUser(u), stats } });
});
catalogRoutes.get('/members/:id/:kind', async (req, res) => {
  const spec = entities[req.params.kind];
  assert(spec?.author, 404, '内容类型无效');
  res.json({
    data: await listEntity(req.params.kind, req, {
      extra: `t.${spec.author}=?`,
      args: [req.params.id],
    }),
  });
});
catalogRoutes.get('/leaderboard', async (req, res) => {
  const f = pageParams(req.query),
    [n] = await query("SELECT COUNT(*) AS n FROM users WHERE status='active' AND role<>'admin'");
  const rows = await query(
    `SELECT * FROM users WHERE status='active' AND role<>'admin' ORDER BY points DESC,created_at,id LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
  );
  const [mine] = req.user
    ? await query(
        "SELECT 1+COUNT(*) AS my_rank FROM users WHERE status='active' AND role<>'admin' AND (points>? OR (points=? AND (created_at<? OR (created_at=? AND id<?))))",
        [req.user.points, req.user.points, req.user.created_at, req.user.created_at, req.user.id],
      )
    : [];
  res.json({
    data: {
      items: rows.map(publicUser),
      total: Number(n.n),
      page: f.page,
      pageSize: f.pageSize,
      myRank: req.user?.role !== 'admin' ? mine?.my_rank : null,
    },
  });
});
catalogRoutes.get('/announcements', async (req, res) => {
  const f = pageParams(req.query),
    [n] = await query("SELECT COUNT(*) AS n FROM announcements WHERE status='published'");
  const rows = await query(
    `SELECT * FROM announcements WHERE status='published' ORDER BY pinned DESC,created_at DESC,id LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
  );
  res.json({
    data: {
      items: rows.map((n) => ({ ...n, pinned: !!n.pinned, createdAt: iso(n.created_at) })),
      total: Number(n.n),
    },
  });
});
catalogRoutes.get('/topics', async (_req, res) => {
  const rows = await query(
      "SELECT tags FROM posts WHERE status='published' UNION ALL SELECT tags FROM questions",
    ),
    counts = new Map();
  for (const row of rows)
    for (const tag of typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags)
      counts.set(tag, (counts.get(tag) || 0) + 1);
  res.json({ data: [...counts].sort((a, b) => b[1] - a[1]) });
});
catalogRoutes.get('/admin/catalog/:kind', role('admin'), async (req, res) =>
  res.json({ data: await listEntity(req.params.kind, req, { scope: 'admin' }) }),
);
catalogRoutes.get('/me/:kind', auth, async (req, res, next) => {
  if (!entities[req.params.kind]?.author) return next();
  res.json({ data: await listEntity(req.params.kind, req, { scope: 'mine' }) });
});
catalogRoutes.get('/me/favorites/:kind', auth, async (req, res) => {
  const maps = {
    posts: ['post_favorites', 'post_id'],
    questions: ['question_favorites', 'question_id'],
    resources: ['resource_favorites', 'resource_id'],
  };
  const spec = maps[req.params.kind];
  assert(spec, 400, '收藏类型无效');
  res.json({
    data: await listEntity(req.params.kind, req, {
      extra: `EXISTS(SELECT 1 FROM ${spec[0]} f WHERE f.${spec[1]}=t.id AND f.user_id=?)`,
      args: [req.user.id],
    }),
  });
});
export async function notificationPage(req) {
  const f = pageParams(req.query),
    where = `user_id=?${req.query.unread === 'true' ? ' AND is_read=0' : ''}`;
  const [n] = await query(`SELECT COUNT(*) AS n FROM notifications WHERE ${where}`, [req.user.id]);
  const [unread] = await query(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND is_read=0',
    [req.user.id],
  );
  const rows = await query(
    `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC,id LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    [req.user.id],
  );
  return {
    items: rows.map((n) => ({
      id: n.id,
      userId: n.user_id,
      title: n.title,
      content: n.content,
      type: n.type,
      link: n.link,
      read: !!n.is_read,
      createdAt: iso(n.created_at),
    })),
    total: Number(n.n),
    unread: Number(unread.n),
    page: f.page,
    pageSize: f.pageSize,
  };
}
catalogRoutes.get('/notifications', auth, async (req, res) =>
  res.json({ data: await notificationPage(req) }),
);
