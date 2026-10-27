import { query } from '../db.mjs';
import { uid } from '../security.mjs';
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
