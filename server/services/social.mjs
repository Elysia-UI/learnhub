import { query } from '../db.mjs';
import { assert, idSchema, validate } from '../security.mjs';

export async function activeMember(id, conn) {
  const memberId = validate(idSchema, id);
  const [member] = await query(
    "SELECT id,name FROM users WHERE id=? AND status='active'",
    [memberId],
    conn,
  );
  assert(member, 404, '用户不存在或暂不可访问');
  return member;
}

// Every count is derived from current rows and excludes unavailable accounts.
export async function socialSummary(memberId, viewerId = '', conn) {
  const [row] = await query(
    `SELECT
      (SELECT COUNT(*) FROM user_follows f JOIN users u ON u.id=f.followee_id AND u.status='active' WHERE f.follower_id=?) AS followingCount,
      (SELECT COUNT(*) FROM user_follows f JOIN users u ON u.id=f.follower_id AND u.status='active' WHERE f.followee_id=?) AS followersCount,
      (SELECT COUNT(*) FROM user_follows f JOIN users u ON u.id=f.followee_id AND u.status='active' WHERE f.follower_id=? AND EXISTS(SELECT 1 FROM user_follows r WHERE r.follower_id=f.followee_id AND r.followee_id=f.follower_id)) AS friendsCount,
      EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.followee_id=?) AS following,
      EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.followee_id=?) AS followsYou`,
    [memberId, memberId, memberId, viewerId, memberId, memberId, viewerId],
    conn,
  );
  return {
    followingCount: Number(row.followingCount),
    followersCount: Number(row.followersCount),
    friendsCount: Number(row.friendsCount),
    following: !!row.following,
    followsYou: !!row.followsYou,
    isFriend: !!row.following && !!row.followsYou,
  };
}
