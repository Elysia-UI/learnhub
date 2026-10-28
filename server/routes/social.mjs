import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.mjs';
import { assert, auth, idSchema, pageParams, publicUser, validate } from '../security.mjs';
import { notify } from '../services/activity.mjs';
import { activeMember, socialSummary } from '../services/social.mjs';

export const socialRoutes = Router();
const followInput = z.object({ active: z.boolean() }).strict();
function respond(res, data) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ data });
}

socialRoutes.get('/members/:id/social', async (req, res) => {
  const member = await activeMember(req.params.id);
  respond(res, await socialSummary(member.id, req.user?.id));
});

socialRoutes.put('/members/:id/follow', auth, async (req, res) => {
  const requestedId = validate(idSchema, req.params.id);
  const { active } = validate(followInput, req.body);
  assert(requestedId !== req.user.id, 400, '不能关注自己');
  // User keys use a case-insensitive database collation. Resolve the stored
  // spelling before comparing identities or choosing a deterministic lock order.
  // Keep this lookup outside the transaction: its first consistent read must
  // happen after acquiring both locks, so a concurrent mutual follow is visible.
  const [resolved] = await query('SELECT id FROM users WHERE id=?', [requestedId]);
  assert(resolved, 404, '用户不存在或暂不可访问');
  assert(resolved.id !== req.user.id, 400, '不能关注自己');
  const result = await transaction(async (conn) => {
    // Serialize changes for this pair, including opposite-direction requests,
    // in a deterministic lock order. Account status is rechecked under the lock.
    const members = new Map();
    for (const id of [req.user.id, resolved.id].sort()) {
      const [member] = await query(
        'SELECT id,name,status FROM users WHERE id=? FOR UPDATE',
        [id],
        conn,
      );
      members.set(id, member);
    }
    const actor = members.get(req.user.id),
      member = members.get(resolved.id);
    assert(actor?.status === 'active', 401, '请重新登录');
    assert(member?.status === 'active', 404, '用户不存在或暂不可访问');
    const followerId = actor.id,
      followeeId = member.id;
    assert(followerId !== followeeId, 400, '不能关注自己');
    if (active) {
      const added = await query(
        'INSERT IGNORE INTO user_follows(follower_id,followee_id) VALUES(?,?)',
        [followerId, followeeId],
        conn,
      );
      if (added.affectedRows) {
        // This event survives unfollow and notification deletion so toggling a
        // relationship cannot repeatedly push notifications to the recipient.
        const first = await query(
          'INSERT IGNORE INTO follow_notification_events(follower_id,followee_id) VALUES(?,?)',
          [followerId, followeeId],
          conn,
        );
        if (first.affectedRows) {
          const [reverse] = await query(
            'SELECT 1 FROM user_follows WHERE follower_id=? AND followee_id=?',
            [followeeId, followerId],
            conn,
          );
          const name = actor.name;
          await notify(
            conn,
            followeeId,
            followerId,
            reverse ? '你们已成为互关好友' : '你有一位新粉丝',
            reverse
              ? `${name} 也关注了你，你们已成为互关好友。`
              : `${name} 关注了你，去看看 TA 的学习分享吧。`,
            'follow',
            '/members/' + followerId,
          );
        }
      }
    } else {
      await query(
        'DELETE FROM user_follows WHERE follower_id=? AND followee_id=?',
        [followerId, followeeId],
        conn,
      );
    }
    return socialSummary(followeeId, followerId, conn);
  });
  respond(res, result);
});

socialRoutes.get('/members/:id/connections', async (req, res) => {
  const type = validate(
    z.enum(['following', 'followers', 'friends']),
    req.query.type || 'following',
  );
  const member = await activeMember(req.params.id);
  if (type === 'friends') {
    assert(req.user, 401, '请先登录');
    assert(req.user.id === member.id, 403, '只能查看自己的好友列表');
  }
  const f = pageParams(req.query);
  const outgoing = type !== 'followers';
  const joinId = outgoing ? 'followee_id' : 'follower_id';
  const ownerId = outgoing ? 'follower_id' : 'followee_id';
  const where = [`f.${ownerId}=?`, "u.status='active'"];
  const args = [member.id];
  if (type === 'friends')
    where.push(
      'EXISTS(SELECT 1 FROM user_follows r WHERE r.follower_id=f.followee_id AND r.followee_id=f.follower_id)',
    );
  if (f.q.trim()) {
    where.push("CONCAT_WS(' ',u.name,u.bio) LIKE ?");
    args.push('%' + f.q.trim().replace(/[\\%_]/g, '\\$&') + '%');
  }
  const from = `user_follows f JOIN users u ON u.id=f.${joinId}`;
  const condition = where.join(' AND ');
  const [count] = await query(`SELECT COUNT(*) AS n FROM ${from} WHERE ${condition}`, args);
  const viewerId = req.user?.id || '';
  const rows = await query(
    `SELECT u.*,
      EXISTS(SELECT 1 FROM user_follows own WHERE own.follower_id=? AND own.followee_id=u.id) AS viewer_following,
      EXISTS(SELECT 1 FROM user_follows reverse_f WHERE reverse_f.follower_id=u.id AND reverse_f.followee_id=?) AS viewer_followed
      FROM ${from} WHERE ${condition}
      ORDER BY f.created_at DESC,u.id LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    [viewerId, viewerId, ...args],
  );
  respond(res, {
    items: rows.map((user) => ({
      ...publicUser(user),
      relationship: {
        following: !!user.viewer_following,
        followsYou: !!user.viewer_followed,
        isFriend: !!user.viewer_following && !!user.viewer_followed,
      },
    })),
    total: Number(count.n),
    page: f.page,
    pageSize: f.pageSize,
  });
});
