import { query } from '../db.mjs';
import { uid, assert } from '../security.mjs';
import { createHash } from 'node:crypto';
export async function changePoints(conn, userId, amount, eventKey, reason) {
  const [user] = await query('SELECT points FROM users WHERE id=? FOR UPDATE', [userId], conn);
  assert(user, 404, '用户不存在');
  if (
    (
      await query(
        'SELECT id FROM point_records WHERE user_id=? AND event_key=?',
        [userId, eventKey],
        conn,
      )
    ).length
  )
    return 0;
  assert(user.points + amount >= 0, 409, '积分不足，不能创建悬赏');
  await query(
    'INSERT INTO point_records(id,user_id,event_key,reason,amount) VALUES(?,?,?,?,?)',
    [uid('points'), userId, eventKey, reason, amount],
    conn,
  );
  await query('UPDATE users SET points=points+? WHERE id=?', [amount, userId], conn);
  await syncBadges(conn, userId);
  return amount;
}
export async function syncBadges(conn, userId) {
  const [counts] = await query(
    `SELECT
    (SELECT COUNT(*) FROM checkins WHERE user_id=?) AS checkins,
    (SELECT COUNT(*) FROM posts WHERE author_id=? AND status='published') AS posts,
    (SELECT COUNT(*) FROM questions q JOIN answers a ON a.id=q.accepted_answer_id WHERE a.author_id=?) AS accepted,
    (SELECT COUNT(*) FROM resources WHERE author_id=? AND status='approved') AS resources,
    (SELECT COUNT(*) FROM course_enrollments e WHERE e.user_id=? AND EXISTS(SELECT 1 FROM course_chapters c WHERE c.course_id=e.course_id) AND NOT EXISTS(SELECT 1 FROM course_chapters c WHERE c.course_id=e.course_id AND NOT EXISTS(SELECT 1 FROM learning_progress p WHERE p.user_id=e.user_id AND p.chapter_id=c.id))) AS completed`,
    Array(5).fill(userId),
    conn,
  );
  for (const [badge, earned] of [
    ['坚持一周', counts.checkins >= 7],
    ['分享新星', counts.posts >= 3],
    ['解惑达人', counts.accepted >= 1],
    ['资源贡献者', counts.resources >= 1],
    ['学有所成', counts.completed >= 1],
  ]) {
    if (earned) {
      const result = await query(
        'INSERT IGNORE INTO user_badges(user_id,badge) VALUES(?,?)',
        [userId, badge],
        conn,
      );
      if (result.affectedRows)
        await notify(conn, userId, '', '获得新徽章', badge, 'badge', '/profile?tab=growth');
    }
  }
}
export async function once(req, conn, work) {
  const key = req.get('Idempotency-Key');
  if (!key) return work();
  assert(/^[a-zA-Z0-9_-]{8,64}$/.test(key), 400, '请求标识无效');
  const route = req.method + req.originalUrl.split('?')[0];
  const hash = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
  await query(
    'INSERT IGNORE INTO request_receipts(user_id,request_key,route,body_hash) VALUES(?,?,?,?)',
    [req.user.id, key, route, hash],
    conn,
  );
  const [receipt] = await query(
    'SELECT * FROM request_receipts WHERE user_id=? AND request_key=? FOR UPDATE',
    [req.user.id, key],
    conn,
  );
  assert(receipt.route === route && receipt.body_hash === hash, 409, '请求标识已被其他操作使用');
  if (receipt.response)
    return typeof receipt.response === 'string' ? JSON.parse(receipt.response) : receipt.response;
  const result = await work();
  await query(
    'UPDATE request_receipts SET response=? WHERE user_id=? AND request_key=?',
    [JSON.stringify(result), req.user.id, key],
    conn,
  );
  return result;
}
export async function award(conn, userId, rule, eventKey, reason) {
  const rows = await query('SELECT amount FROM point_rules WHERE code=?', [rule], conn);
  const amount = rows[0]?.amount || 0;
  const result = await query(
    'INSERT IGNORE INTO point_records(id,user_id,event_key,reason,amount) VALUES(?,?,?,?,?)',
    [uid('points'), userId, eventKey, reason, amount],
    conn,
  );
  if (result.affectedRows)
    await query('UPDATE users SET points=points+? WHERE id=?', [amount, userId], conn);
  await syncBadges(conn, userId);
  return result.affectedRows ? amount : 0;
}
export async function notify(conn, userId, actorId, title, content, type, link) {
  if (userId === actorId) return;
  await query(
    'INSERT INTO notifications(id,user_id,title,content,type,link) VALUES(?,?,?,?,?,?)',
    [uid('notice'), userId, title, content.slice(0, 2000), type, link || null],
    conn,
  );
}
export async function audit(conn, userId, action) {
  await query(
    'INSERT INTO admin_operation_logs(id,actor_id,action) VALUES(?,?,?)',
    [uid('audit'), userId, action.slice(0, 500)],
    conn,
  );
}
