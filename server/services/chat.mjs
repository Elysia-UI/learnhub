import { query, transaction, iso } from '../db.mjs';
import { assert, publicUser, uid } from '../security.mjs';

const publicFields = ['id', 'name', 'avatar', 'bio', 'role', 'points', 'status', 'created_at'];
const messageFields = [
  'conversation_id',
  'client_id',
  'sender_id',
  'recipient_id',
  'content',
  'created_at',
  'read_at',
];
const userColumns = (alias, prefix = '') =>
  publicFields.map((key) => `${alias}.${key} AS ${prefix}${key}`).join(',');
export const messageColumns = (alias = 'm', prefix = '') =>
  [
    `CAST(${alias}.id AS CHAR) AS ${prefix}id`,
    ...messageFields.map((key) => `${alias}.${key} AS ${prefix}${key}`),
  ].join(',');
export function messageDTO(row, prefix = '') {
  return {
    id: String(row[prefix + 'id']),
    clientId: row[prefix + 'client_id'],
    senderId: row[prefix + 'sender_id'],
    recipientId: row[prefix + 'recipient_id'],
    content: row[prefix + 'content'],
    createdAt: iso(row[prefix + 'created_at']),
    readAt: iso(row[prefix + 'read_at']) || null,
  };
}
const friendship = (alias) => `(${alias}.status='active'
  AND EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.followee_id=${alias}.id)
  AND EXISTS(SELECT 1 FROM user_follows r WHERE r.follower_id=${alias}.id AND r.followee_id=?))`;

export async function chatContext(viewerId, requestedPeerId, conn) {
  const [row] = await query(
    `SELECT ${userColumns('u')},c.id AS conversation_id,${friendship('u')} AS can_send
     FROM users u LEFT JOIN dm_conversations c
       ON (c.user_low_id=? AND c.user_high_id=u.id) OR (c.user_high_id=? AND c.user_low_id=u.id)
     WHERE u.id=?`,
    [viewerId, viewerId, viewerId, viewerId, requestedPeerId],
    conn,
  );
  assert(row, 404, '用户不存在');
  assert(row.id !== viewerId, 400, '不能与自己聊天');
  return {
    peer: publicUser(row),
    conversationId: row.conversation_id || null,
    canSend: !!row.can_send,
  };
}
export function requireReadable(context) {
  assert(context.canSend || context.conversationId, 403, '互相关注成为好友后才能聊天');
}
export async function chatUnreadCount(userId, conn) {
  const [row] = await query(
    'SELECT COUNT(*) AS n FROM dm_messages WHERE recipient_id=? AND read_at IS NULL',
    [userId],
    conn,
  );
  return Number(row.n);
}
export async function peerReadUpTo(conversationId, viewerId, conn) {
  if (!conversationId) return '0';
  const [row] = await query(
    'SELECT CAST(COALESCE(MAX(id),0) AS CHAR) AS id FROM dm_messages WHERE conversation_id=? AND sender_id=? AND read_at IS NOT NULL',
    [conversationId, viewerId],
    conn,
  );
  return row.id;
}

export async function listThreads(userId, { page, pageSize, q }) {
  const args = [userId, userId, userId];
  let where = '(c.user_low_id=? OR c.user_high_id=?)';
  if (q.trim()) {
    where += " AND CONCAT_WS(' ',u.name,u.bio) LIKE ?";
    args.push('%' + q.trim().replace(/[\\%_]/g, '\\$&') + '%');
  }
  const from = `dm_conversations c
    JOIN users u ON u.id=CASE WHEN c.user_low_id=? THEN c.user_high_id ELSE c.user_low_id END
    JOIN dm_messages m ON m.id=c.last_message_id AND m.conversation_id=c.id`;
  const [count] = await query(`SELECT COUNT(*) AS n FROM ${from} WHERE ${where}`, args);
  const rows = await query(
    `SELECT ${userColumns('u', 'peer_')},${messageColumns('m', 'last_')},
      (SELECT COUNT(*) FROM dm_messages unread WHERE unread.conversation_id=c.id AND unread.recipient_id=? AND unread.read_at IS NULL) AS unread_count,
      ${friendship('u')} AS can_send
      FROM ${from} WHERE ${where}
      ORDER BY c.last_message_id DESC,c.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    [userId, userId, userId, ...args],
  );
  return {
    items: rows.map((row) => ({
      peer: publicUser(Object.fromEntries(publicFields.map((key) => [key, row['peer_' + key]]))),
      lastMessage: messageDTO(row, 'last_'),
      unreadCount: Number(row.unread_count),
      canSend: !!row.can_send,
    })),
    total: Number(count.n),
    page,
    pageSize,
    unreadCount: await chatUnreadCount(userId),
  };
}

export async function listMessages(userId, requestedPeerId, { before, after, limit }) {
  const context = await chatContext(userId, requestedPeerId);
  requireReadable(context);
  if (!context.conversationId)
    return {
      peer: context.peer,
      canSend: context.canSend,
      items: [],
      hasMore: false,
      peerReadUpTo: '0',
    };
  const args = [context.conversationId];
  let range = '';
  if (before !== undefined) {
    range = ' AND m.id<?';
    args.push(before);
  }
  if (after !== undefined) {
    range = ' AND m.id>?';
    args.push(after);
  }
  const [rows, readUpTo] = await Promise.all([
    query(
      `SELECT ${messageColumns()} FROM dm_messages m WHERE m.conversation_id=?${range} ORDER BY m.id ${after !== undefined ? 'ASC' : 'DESC'} LIMIT ${limit + 1}`,
      args,
    ),
    peerReadUpTo(context.conversationId, userId),
  ]);
  const selected = rows.slice(0, limit);
  if (after === undefined) selected.reverse();
  return {
    peer: context.peer,
    canSend: context.canSend,
    items: selected.map((row) => messageDTO(row)),
    hasMore: rows.length > limit,
    peerReadUpTo: readUpTo,
  };
}

export async function sendMessage(userId, requestedPeerId, { content, clientId }) {
  // Resolve case-insensitive DB keys before the transaction to establish the
  // consistent-read snapshot only after the pair's write locks are held.
  const [peer] = await query('SELECT id FROM users WHERE id=?', [requestedPeerId]);
  assert(peer, 404, '用户不存在');
  assert(peer.id !== userId, 400, '不能与自己聊天');
  const pair = [userId, peer.id].sort();
  return transaction(async (conn) => {
    const members = new Map();
    for (const id of pair) {
      const [member] = await query('SELECT id,status FROM users WHERE id=? FOR UPDATE', [id], conn);
      members.set(id, member);
    }
    assert(members.get(userId)?.status === 'active', 401, '请重新登录');
    assert(members.get(peer.id), 404, '用户不存在');
    const [existing] = await query(
      `SELECT ${messageColumns()} FROM dm_messages m WHERE sender_id=? AND client_id=?`,
      [userId, clientId],
      conn,
    );
    if (existing) {
      assert(
        existing.recipient_id === peer.id && existing.content === content,
        409,
        '这条发送标识已用于其他消息',
      );
      return {
        message: messageDTO(existing),
        peerReadUpTo: await peerReadUpTo(existing.conversation_id, userId, conn),
        created: false,
        peerId: peer.id,
      };
    }
    const context = await chatContext(userId, peer.id, conn);
    assert(context.canSend, 403, '互相关注成为好友后才能发送新消息');
    const [rate] = await query(
      'SELECT COUNT(*) AS n FROM dm_messages WHERE sender_id=? AND created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)',
      [userId],
      conn,
    );
    assert(rate.n < 30, 429, '消息发送过于频繁，请稍后再试');
    let conversationId = context.conversationId;
    if (!conversationId) {
      conversationId = uid('dm');
      await query(
        'INSERT INTO dm_conversations(id,user_low_id,user_high_id) VALUES(?,?,?)',
        [conversationId, ...pair],
        conn,
      );
    }
    await query(
      'INSERT INTO dm_messages(conversation_id,sender_id,recipient_id,client_id,content) VALUES(?,?,?,?,?)',
      [conversationId, userId, peer.id, clientId, content],
      conn,
    );
    // Never coerce an unsigned BIGINT through a JavaScript Number.
    const [message] = await query(
      `SELECT ${messageColumns()} FROM dm_messages m WHERE sender_id=? AND client_id=?`,
      [userId, clientId],
      conn,
    );
    await query(
      'UPDATE dm_conversations SET last_message_id=?,last_message_at=? WHERE id=?',
      [message.id, message.created_at, conversationId],
      conn,
    );
    return {
      message: messageDTO(message),
      peerReadUpTo: await peerReadUpTo(conversationId, userId, conn),
      created: true,
      peerId: peer.id,
    };
  });
}

export async function readMessages(userId, requestedPeerId, upToId) {
  const context = await chatContext(userId, requestedPeerId);
  requireReadable(context);
  return transaction(async (conn) => {
    let changed = false;
    if (upToId !== '0') {
      const [message] = await query(
        'SELECT 1 FROM dm_messages WHERE conversation_id=? AND id=?',
        [context.conversationId || '', upToId],
        conn,
      );
      assert(message, 400, '消息不属于当前会话');
      const result = await query(
        'UPDATE dm_messages SET read_at=UTC_TIMESTAMP(3) WHERE conversation_id=? AND recipient_id=? AND id<=? AND read_at IS NULL',
        [context.conversationId, userId, upToId],
        conn,
      );
      changed = !!result.affectedRows;
    }
    return { unreadCount: await chatUnreadCount(userId, conn), changed, peerId: context.peer.id };
  });
}
