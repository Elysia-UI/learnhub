import { Router } from 'express';
import { query, transaction, iso } from '../db.mjs';
import { auth, assert, pageParams, publicUser } from '../security.mjs';
import { postsDTO, coursesDTO, questionsDTO } from '../services/snapshot.mjs';
import { syncBadges } from '../services/activity.mjs';
export const personalRoutes = Router();
personalRoutes.use('/me', auth);
async function pageRows(req, from, where, args, select = 't.*', order = 't.created_at DESC,t.id') {
  const f = pageParams(req.query),
    [n] = await query(`SELECT COUNT(*) AS n FROM ${from} WHERE ${where}`, args);
  const items = await query(
    `SELECT ${select} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    args,
  );
  return { items, total: Number(n.n), page: f.page, pageSize: f.pageSize };
}
personalRoutes.get('/me/learning', async (req, res) => {
  const r = await pageRows(
    req,
    'course_enrollments t JOIN courses c ON c.id=t.course_id',
    't.user_id=?',
    [req.user.id],
    'c.*',
    't.updated_at DESC,t.course_id',
  );
  r.items = await coursesDTO(r.items);
  r.enrollments = await query(
    'SELECT e.course_id AS courseId,e.last_chapter_id AS lastChapter, e.updated_at AS updatedAt, (SELECT JSON_ARRAYAGG(p.chapter_id) FROM learning_progress p WHERE p.user_id=e.user_id AND p.course_id=e.course_id) AS completed FROM course_enrollments e WHERE e.user_id=?',
    [req.user.id],
  );
  r.enrollments = r.enrollments.map((e) => ({
    ...e,
    userId: req.user.id,
    completed: typeof e.completed === 'string' ? JSON.parse(e.completed) : e.completed || [],
  }));
  res.json({ data: r });
});
personalRoutes.get('/me/points', async (req, res) => {
  const r = await pageRows(req, 'point_records t', 't.user_id=?', [req.user.id]);
  r.items = r.items.map((p) => ({
    id: p.id,
    userId: p.user_id,
    reason: p.reason,
    amount: p.amount,
    createdAt: iso(p.created_at),
  }));
  res.json({ data: r });
});
personalRoutes.get('/me/history', async (req, res) => {
  const r = await pageRows(
    req,
    'browsing_history t JOIN posts p ON p.id=t.post_id',
    "t.user_id=? AND (p.status='published' OR p.author_id=?)",
    [req.user.id, req.user.id],
    'p.*',
    't.visited_at DESC,t.post_id',
  );
  r.items = await postsDTO(r.items);
  res.json({ data: r });
});
personalRoutes.get('/me/downloads', async (req, res) => {
  const r = await pageRows(
    req,
    'resource_downloads t JOIN resources r ON r.id=t.resource_id',
    't.user_id=?',
    [req.user.id],
    't.id,t.resource_id AS resourceId,r.title,t.created_at AS createdAt',
  );
  res.json({ data: r });
});
personalRoutes.get('/me/comments', async (req, res) => {
  const r = await pageRows(
    req,
    'post_comments t JOIN posts p ON p.id=t.post_id',
    "t.author_id=? AND (p.status='published' OR p.author_id=?)",
    [req.user.id, req.user.id],
    't.*,p.title AS post_title',
  );
  r.items = r.items.map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: iso(c.created_at),
    post: { id: c.post_id, title: c.post_title },
  }));
  res.json({ data: r });
});
personalRoutes.get('/me/answers', async (req, res) => {
  const r = await pageRows(
    req,
    'answers t JOIN questions q ON q.id=t.question_id',
    't.author_id=?',
    [req.user.id],
    't.*,q.title AS question_title,q.accepted_answer_id',
  );
  r.items = r.items.map((a) => ({
    id: a.id,
    content: a.content,
    createdAt: iso(a.created_at),
    question: { id: a.question_id, title: a.question_title, acceptedId: a.accepted_answer_id },
  }));
  res.json({ data: r });
});
personalRoutes.get('/members/:id/answers', async (req, res) => {
  const r = await pageRows(
    req,
    'answers t JOIN questions q ON q.id=t.question_id',
    't.author_id=?',
    [req.params.id],
    't.*,q.title AS question_title,q.accepted_answer_id',
  );
  r.items = r.items.map((a) => ({
    id: a.id,
    content: a.content,
    createdAt: iso(a.created_at),
    question: { id: a.question_id, title: a.question_title, acceptedId: a.accepted_answer_id },
  }));
  res.json({ data: r });
});
personalRoutes.get('/me/growth', async (req, res) => {
  const [u] = await query('SELECT * FROM users WHERE id=?', [req.user.id]);
  const badges = await query(
    'SELECT badge AS name,earned_at AS earnedAt FROM user_badges WHERE user_id=? ORDER BY earned_at',
    [req.user.id],
  );
  const [stats] = await query(
    `SELECT (SELECT COUNT(*) FROM posts WHERE author_id=?) AS posts,(SELECT COUNT(*) FROM post_likes l JOIN posts p ON p.id=l.post_id WHERE p.author_id=?) AS likes,(SELECT COUNT(*) FROM learning_progress WHERE user_id=?) AS completed,(SELECT COUNT(*) FROM checkins WHERE user_id=?) AS checkins`,
    Array(4).fill(req.user.id),
  );
  const activity = await query(
    `SELECT day,SUM(n) AS count FROM (
    SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'),'%Y-%m-%d') AS day,COUNT(*) AS n FROM posts WHERE author_id=? GROUP BY day
    UNION ALL SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'),'%Y-%m-%d'),COUNT(*) FROM answers WHERE author_id=? GROUP BY 1
    UNION ALL SELECT DATE_FORMAT(day,'%Y-%m-%d'),1 FROM checkins WHERE user_id=?
  ) a WHERE day>=DATE_FORMAT(DATE_SUB(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+08:00'),INTERVAL 34 DAY),'%Y-%m-%d') GROUP BY day`,
    Array(3).fill(req.user.id),
  );
  res.json({
    data: {
      user: publicUser(u),
      level: Math.min(10, Math.floor(u.points / 30) + 1),
      badges,
      stats,
      activity,
    },
  });
});
const exportScopes = [
  'profile',
  'posts',
  'questions',
  'resources',
  'learning',
  'favorites',
  'points',
  'downloads',
];
personalRoutes.get('/me/export', async (req, res) => {
  const scopes = String(req.query.scopes || 'profile').split(',');
  assert(scopes.length && scopes.every((s) => exportScopes.includes(s)), 400, '导出范围无效');
  const id = req.user.id,
    data = { exportedAt: new Date().toISOString(), scopes };
  // Each statement is restricted to the authenticated user, independent of bootstrap limits.
  for (const scope of new Set(scopes)) {
    if (scope === 'profile') data.profile = { ...publicUser(req.user), email: req.user.email };
    if (scope === 'posts')
      data.posts = await postsDTO(
        await query('SELECT * FROM posts WHERE author_id=? ORDER BY created_at', [id]),
      );
    if (scope === 'questions')
      data.questions = await questionsDTO(
        await query('SELECT * FROM questions WHERE author_id=? ORDER BY created_at', [id]),
      );
    if (scope === 'resources')
      data.resources = await query(
        'SELECT id,title,description,category_id,status,filename,downloads,created_at FROM resources WHERE author_id=?',
        [id],
      );
    if (scope === 'learning') {
      data.enrollments = await query('SELECT * FROM course_enrollments WHERE user_id=?', [id]);
      data.progress = await query('SELECT * FROM learning_progress WHERE user_id=?', [id]);
    }
    if (scope === 'favorites') {
      data.favorites = {};
      for (const t of ['post_favorites', 'question_favorites', 'resource_favorites'])
        data.favorites[t] = await query(`SELECT * FROM ${t} WHERE user_id=?`, [id]);
    }
    if (scope === 'points')
      data.points = await query(
        'SELECT reason,amount,created_at FROM point_records WHERE user_id=? ORDER BY created_at',
        [id],
      );
    if (scope === 'downloads')
      data.downloads = await query(
        'SELECT resource_id,created_at FROM resource_downloads WHERE user_id=? ORDER BY created_at',
        [id],
      );
  }
  res.json({ data });
});
