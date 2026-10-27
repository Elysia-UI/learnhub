import { query, iso, json } from '../db.mjs';
import { publicUser } from '../security.mjs';
const group = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row[key]) || [];
    list.push(row);
    map.set(row[key], list);
  }
  return map;
};
const marks = (ids) => ids.map(() => '?').join(',');
export async function postsDTO(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id),
    clause = marks(ids);
  const [comments, likes, favorites] = await Promise.all([
    query(`SELECT * FROM post_comments WHERE post_id IN (${clause}) ORDER BY created_at,id`, ids),
    query(`SELECT * FROM post_likes WHERE post_id IN (${clause})`, ids),
    query(`SELECT * FROM post_favorites WHERE post_id IN (${clause})`, ids),
  ]);
  const cs = group(comments, 'post_id'),
    ls = group(likes, 'post_id'),
    fs = group(favorites, 'post_id');
  return rows.map((p) => ({
    id: p.id,
    authorId: p.author_id,
    category: p.category_id,
    title: p.title,
    content: p.content,
    tags: json(p.tags),
    type: p.type,
    image: p.image || undefined,
    views: p.views,
    featured: !!p.featured,
    pinned: !!p.pinned,
    status: p.status,
    createdAt: iso(p.created_at),
    likes: (ls.get(p.id) || []).map((r) => r.user_id),
    favorites: (fs.get(p.id) || []).map((r) => r.user_id),
    comments: (cs.get(p.id) || []).map((c) => ({
      id: c.id,
      authorId: c.author_id,
      content: c.content,
      parentId: c.parent_id || undefined,
      createdAt: iso(c.created_at),
    })),
  }));
}
export async function coursesDTO(rows) {
  const [chapters, counts] = await Promise.all([
    query('SELECT * FROM course_chapters ORDER BY course_id,position'),
    query('SELECT course_id,COUNT(*) AS n FROM course_enrollments GROUP BY course_id'),
  ]);
  const ch = group(chapters, 'course_id'),
    ns = new Map(counts.map((r) => [r.course_id, r.n]));
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    description: c.description,
    category: c.category_id,
    teacherId: c.teacher_id,
    image: c.image,
    visual: c.visual,
    badge: c.badge,
    rating: Number(c.rating),
    hours: c.hours,
    level: c.level,
    tags: json(c.tags),
    enrollmentCount: ns.get(c.id) || 0,
    createdAt: iso(c.created_at),
    chapters: (ch.get(c.id) || []).map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      duration: r.duration,
    })),
  }));
}
export async function questionsDTO(rows) {
  const [answers, comments, likes, favorites] = await Promise.all([
    query('SELECT * FROM answers ORDER BY created_at'),
    query('SELECT * FROM answer_comments ORDER BY created_at'),
    query('SELECT * FROM answer_likes'),
    query('SELECT * FROM question_favorites'),
  ]);
  const aa = group(answers, 'question_id'),
    cc = group(comments, 'answer_id'),
    ll = group(likes, 'answer_id'),
    ff = group(favorites, 'question_id');
  return rows.map((q) => ({
    id: q.id,
    title: q.title,
    content: q.content,
    authorId: q.author_id,
    category: q.category_id,
    tags: json(q.tags),
    createdAt: iso(q.created_at),
    views: q.views,
    bounty: q.bounty,
    acceptedId: q.accepted_answer_id || undefined,
    favorites: (ff.get(q.id) || []).map((f) => f.user_id),
    answers: (aa.get(q.id) || []).map((a) => ({
      id: a.id,
      authorId: a.author_id,
      content: a.content,
      createdAt: iso(a.created_at),
      likes: (ll.get(a.id) || []).map((l) => l.user_id),
      comments: (cc.get(a.id) || []).map((c) => ({
        id: c.id,
        authorId: c.author_id,
        content: c.content,
        createdAt: iso(c.created_at),
      })),
    })),
  }));
}
export async function resourcesDTO(rows) {
  const favorites = group(await query('SELECT * FROM resource_favorites'), 'resource_id');
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    authorId: r.author_id,
    category: r.category_id,
    type: r.type,
    size:
      r.byte_size < 1048576
        ? `${(r.byte_size / 1024).toFixed(1)} KB`
        : `${(r.byte_size / 1048576).toFixed(1)} MB`,
    downloads: r.downloads,
    filename: r.filename,
    url: `/api/resources/${r.id}/download`,
    tags: json(r.tags),
    status: r.status,
    createdAt: iso(r.created_at),
    favorites: (favorites.get(r.id) || []).map((f) => f.user_id),
  }));
}
export async function stats() {
  const [row] = await query(
    `SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM posts WHERE status='published') AS posts,(SELECT COUNT(*) FROM questions) AS questions,(SELECT COUNT(*) FROM courses) AS courses,(SELECT COUNT(*) FROM resources WHERE status='approved') AS resources,(SELECT COUNT(*) FROM post_comments) AS comments,(SELECT COUNT(*) FROM course_chapters) AS chapters,(SELECT COALESCE(SUM(downloads),0) FROM resources) AS downloads,(SELECT COUNT(*) FROM resources WHERE status='pending') AS pendingResources,(SELECT COUNT(*) FROM checkins WHERE day=DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+08:00'))) AS checkinsToday`,
  );
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}
export async function snapshot(user) {
  const userId = user?.id || '',
    admin = user?.role === 'admin';
  const [
    users,
    categories,
    posts,
    courses,
    questions,
    resources,
    notices,
    notifications,
    enrollments,
    progress,
    checkins,
    points,
    history,
    logs,
    rules,
    conversations,
    statistics,
  ] = await Promise.all([
    query(
      'SELECT id,name,avatar,bio,role,points,status,created_at FROM users ORDER BY created_at LIMIT 500',
    ),
    query('SELECT * FROM categories ORDER BY id'),
    query(
      "SELECT * FROM posts WHERE status='published' OR author_id=? OR ?=1 ORDER BY pinned DESC,created_at DESC LIMIT 500",
      [userId, Number(admin)],
    ).then(postsDTO),
    query('SELECT * FROM courses ORDER BY featured DESC,created_at DESC LIMIT 200').then(
      coursesDTO,
    ),
    query('SELECT * FROM questions ORDER BY created_at DESC LIMIT 300').then(questionsDTO),
    query(
      "SELECT * FROM resources WHERE status='approved' OR author_id=? OR ?=1 ORDER BY created_at DESC LIMIT 500",
      [userId, Number(admin)],
    ).then(resourcesDTO),
    query('SELECT * FROM announcements ORDER BY pinned DESC,created_at DESC LIMIT 100'),
    query('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 300', [
      userId,
    ]),
    query('SELECT * FROM course_enrollments WHERE user_id=?', [userId]),
    query('SELECT * FROM learning_progress WHERE user_id=?', [userId]),
    query(
      "SELECT user_id,DATE_FORMAT(day,'%Y-%m-%d') AS day FROM checkins WHERE user_id=? ORDER BY day DESC LIMIT 366",
      [userId],
    ),
    query('SELECT * FROM point_records WHERE user_id=? ORDER BY created_at DESC LIMIT 300', [
      userId,
    ]),
    query('SELECT * FROM browsing_history WHERE user_id=? ORDER BY visited_at DESC LIMIT 100', [
      userId,
    ]),
    admin ? query('SELECT * FROM admin_operation_logs ORDER BY created_at DESC LIMIT 200') : [],
    query('SELECT * FROM point_rules'),
    query('SELECT * FROM ai_conversations WHERE user_id=? ORDER BY created_at DESC LIMIT 100', [
      userId,
    ]),
    stats(),
  ]);
  return {
    version: 2,
    users: users.map(publicUser),
    categories,
    posts,
    courses,
    questions,
    resources,
    notices: notices.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      type: n.type,
      pinned: !!n.pinned,
      createdAt: iso(n.created_at),
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      userId: n.user_id,
      title: n.title,
      content: n.content,
      type: n.type,
      link: n.link,
      read: !!n.is_read,
      createdAt: iso(n.created_at),
    })),
    enrollments: enrollments.map((e) => ({
      userId: e.user_id,
      courseId: e.course_id,
      completed: progress.filter((p) => p.course_id === e.course_id).map((p) => p.chapter_id),
      lastChapter: e.last_chapter_id || undefined,
      updatedAt: iso(e.updated_at),
    })),
    checkins: checkins.map((c) => ({ userId: c.user_id, date: c.day })),
    points: points.map((p) => ({
      id: p.id,
      userId: p.user_id,
      reason: p.reason,
      amount: p.amount,
      createdAt: iso(p.created_at),
    })),
    history: history.map((h) => ({
      userId: h.user_id,
      postId: h.post_id,
      date: iso(h.visited_at),
    })),
    logs: logs.map((l) => ({
      id: l.id,
      actorId: l.actor_id,
      action: l.action,
      createdAt: iso(l.created_at),
    })),
    pointRules: Object.fromEntries(rules.map((r) => [r.code, r.amount])),
    conversations: conversations.map((c) => ({
      id: c.id,
      userId: c.user_id,
      title: c.title,
      messages: json(c.messages),
      createdAt: iso(c.created_at),
    })),
    stats: statistics,
  };
}
