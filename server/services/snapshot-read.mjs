import { query, json } from '../db.mjs';
import { inflateSync } from 'node:zlib';

// A remote database makes many short reads expensive. Fetch the existing bootstrap
// read models in one consistent statement, then reuse the normal DTOs.
// Fixed read models only. Values are bound parameters; multipleStatements stays disabled.
const fields = {
  users: 'id,name,avatar,bio,role,points,status,created_at',
  categories: 'id,name,icon,color,description,enabled',
  posts:
    'id,author_id,category_id,title,content,tags,type,image,views,featured,pinned,status,review_reason,created_at',
  courses:
    'id,teacher_id,category_id,title,subtitle,description,image,visual,badge,rating,hours,level,tags,created_at,featured',
  questions:
    'id,author_id,category_id,title,content,tags,accepted_answer_id,views,bounty,bounty_status,created_at',
  resources:
    'id,author_id,category_id,title,description,type,byte_size,filename,tags,status,downloads,created_at',
  notices: 'id,title,content,type,pinned,status,created_at',
  notifications: 'id,user_id,title,content,type,link,is_read,created_at',
  enrollments: 'user_id,course_id,last_chapter_id,updated_at',
  progress: 'user_id,course_id,chapter_id',
  checkins: 'user_id,day',
  points: 'id,user_id,reason,amount,created_at',
  history: 'user_id,post_id,visited_at',
  logs: 'id,actor_id,action,created_at',
  rules: 'code,amount',
  conversations: 'id,user_id,title,messages,kind,created_at',
  postComments: 'id,post_id,author_id,parent_id,content,created_at',
  postLikes: 'post_id,user_id',
  postFavorites: 'post_id,user_id',
  chapters: 'id,course_id,title,content,duration,position',
  courseCounts: 'course_id,n',
  answers: 'id,question_id,author_id,content,created_at',
  answerComments: 'id,answer_id,author_id,content,created_at',
  answerLikes: 'answer_id,user_id',
  questionFavorites: 'question_id,user_id',
  resourceFavorites: 'resource_id,user_id',
};

function arraySelect(name, select) {
  const columns = fields[name].split(',').flatMap((column) => {
    const value = column.endsWith('_at')
      ? `DATE_FORMAT(r.${column},'%Y-%m-%dT%H:%i:%s.%fZ')`
      : column === 'day'
        ? "DATE_FORMAT(r.day,'%Y-%m-%d')"
        : `r.${column}`;
    return [`'${column}'`, value];
  });
  return `'${name}',(SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(${columns.join(',')})),JSON_ARRAY()) FROM (${select}) r)`;
}

const createdDesc = (a, b) =>
  String(b.created_at).localeCompare(String(a.created_at)) || a.id.localeCompare(b.id);
const createdAsc = (a, b) =>
  String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id);

export async function readSnapshot(user) {
  const userId = user?.id || '',
    admin = Number(user?.role === 'admin');
  const args = [userId, admin, userId, admin];
  const sets = [];
  function add(name, select, params = []) {
    sets.push(arraySelect(name, select));
    args.push(...params);
  }
  add('users', `SELECT ${fields.users} FROM users ORDER BY created_at,id LIMIT 500`);
  add('categories', 'SELECT * FROM categories');
  add('posts', 'SELECT * FROM selected_posts');
  add('courses', 'SELECT * FROM selected_courses');
  add('questions', 'SELECT * FROM selected_questions');
  add('resources', 'SELECT * FROM selected_resources');
  add(
    'notices',
    "SELECT * FROM announcements WHERE status='published' OR ?=1 ORDER BY pinned DESC,created_at DESC,id LIMIT 100",
    [admin],
  );
  add(
    'notifications',
    'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC,id LIMIT 300',
    [userId],
  );
  add('enrollments', 'SELECT * FROM course_enrollments WHERE user_id=?', [userId]);
  add('progress', 'SELECT * FROM learning_progress WHERE user_id=?', [userId]);
  add('checkins', 'SELECT * FROM checkins WHERE user_id=? ORDER BY day DESC LIMIT 366', [userId]);
  add(
    'points',
    'SELECT * FROM point_records WHERE user_id=? ORDER BY created_at DESC,id LIMIT 300',
    [userId],
  );
  add(
    'history',
    'SELECT * FROM browsing_history WHERE user_id=? ORDER BY visited_at DESC,post_id LIMIT 100',
    [userId],
  );
  add(
    'logs',
    'SELECT * FROM admin_operation_logs WHERE ?=1 ORDER BY created_at DESC,id LIMIT 200',
    [admin],
  );
  add('rules', 'SELECT * FROM point_rules');
  add(
    'conversations',
    'SELECT * FROM ai_conversations WHERE user_id=? ORDER BY created_at DESC,id LIMIT 100',
    [userId],
  );
  add('postComments', 'SELECT c.* FROM post_comments c JOIN selected_posts p ON p.id=c.post_id');
  add('postLikes', 'SELECT l.* FROM post_likes l JOIN selected_posts p ON p.id=l.post_id');
  add('postFavorites', 'SELECT f.* FROM post_favorites f JOIN selected_posts p ON p.id=f.post_id');
  add(
    'chapters',
    'SELECT ch.* FROM course_chapters ch JOIN selected_courses c ON c.id=ch.course_id',
  );
  add(
    'courseCounts',
    'SELECT e.course_id,COUNT(*) AS n FROM course_enrollments e JOIN selected_courses c ON c.id=e.course_id GROUP BY e.course_id',
  );
  add('answers', 'SELECT * FROM selected_answers');
  add(
    'answerComments',
    'SELECT c.* FROM answer_comments c JOIN selected_answers a ON a.id=c.answer_id',
  );
  add('answerLikes', 'SELECT l.* FROM answer_likes l JOIN selected_answers a ON a.id=l.answer_id');
  add(
    'questionFavorites',
    'SELECT f.* FROM question_favorites f JOIN selected_questions q ON q.id=f.question_id',
  );
  add(
    'resourceFavorites',
    'SELECT f.* FROM resource_favorites f JOIN selected_resources r ON r.id=f.resource_id',
  );
  sets.push(`'statistics',JSON_OBJECT(
    'users',(SELECT COUNT(*) FROM users),
    'posts',(SELECT COUNT(*) FROM posts WHERE status='published'),
    'questions',(SELECT COUNT(*) FROM questions),
    'courses',(SELECT COUNT(*) FROM courses),
    'resources',(SELECT COUNT(*) FROM resources WHERE status='approved'),
    'comments',(SELECT COUNT(*) FROM post_comments),
    'chapters',(SELECT COUNT(*) FROM course_chapters),
    'downloads',(SELECT COALESCE(SUM(downloads),0) FROM resources),
    'pendingResources',(SELECT COUNT(*) FROM resources WHERE status='pending'),
    'checkinsToday',(SELECT COUNT(*) FROM checkins WHERE day=DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+08:00')))
  )`);
  sets.push("'unreadCount',(SELECT COUNT(*) FROM notifications WHERE user_id=? AND is_read=0)");
  args.push(userId);
  const withSql = `WITH
    selected_posts AS (SELECT * FROM posts WHERE status='published' OR author_id=? OR ?=1 ORDER BY pinned DESC,created_at DESC,id LIMIT 500),
    selected_courses AS (SELECT * FROM courses ORDER BY featured DESC,created_at DESC,id LIMIT 200),
    selected_questions AS (SELECT * FROM questions ORDER BY created_at DESC,id LIMIT 300),
    selected_resources AS (SELECT * FROM resources WHERE status='approved' OR author_id=? OR ?=1 ORDER BY created_at DESC,id LIMIT 500),
    selected_answers AS (SELECT a.* FROM answers a JOIN selected_questions q ON q.id=a.question_id)`;
  const payloadSql = `JSON_OBJECT(${sets.join(',')})`;
  let [row] = await query(`${withSql} SELECT COMPRESS(${payloadSql}) AS payload`, args);
  let databaseBytes;
  let data;
  if (row.payload == null) {
    // MySQL builds without zlib can still serve the same response without compression.
    [row] = await query(`${withSql} SELECT ${payloadSql} AS payload`, args);
    data = json(row.payload, {});
    databaseBytes = Buffer.byteLength(JSON.stringify(data));
  } else {
    const packed = row.payload;
    if (!Buffer.isBuffer(packed) || packed.length < 5)
      throw new Error('Invalid compressed snapshot');
    const expected = packed.readUInt32LE(0) & 0x3fffffff;
    if (expected > 64 * 1024 * 1024) throw new Error('Snapshot exceeds read limit');
    const raw = inflateSync(packed.subarray(4), { maxOutputLength: 64 * 1024 * 1024 });
    if (raw.length !== expected) throw new Error('Snapshot length mismatch');
    data = JSON.parse(raw.toString('utf8'));
    databaseBytes = packed.length;
  }
  data.databaseBytes = databaseBytes;
  // JSON aggregation does not guarantee order. Restore each read model's explicit ordering.
  data.users.sort(createdAsc);
  data.categories.sort((a, b) => a.id.localeCompare(b.id));
  data.posts.sort((a, b) => Number(b.pinned) - Number(a.pinned) || createdDesc(a, b));
  data.courses.sort((a, b) => Number(b.featured) - Number(a.featured) || createdDesc(a, b));
  for (const key of ['questions', 'resources', 'notifications', 'points', 'logs', 'conversations'])
    data[key].sort(createdDesc);
  data.notices.sort((a, b) => Number(b.pinned) - Number(a.pinned) || createdDesc(a, b));
  data.postComments.sort(createdAsc);
  data.answers.sort(createdAsc);
  data.answerComments.sort(createdAsc);
  data.chapters.sort((a, b) => a.course_id.localeCompare(b.course_id) || a.position - b.position);
  data.history.sort((a, b) => String(b.visited_at).localeCompare(String(a.visited_at)));
  data.checkins.sort((a, b) => b.day.localeCompare(a.day));
  return data;
}
