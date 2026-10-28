import { query } from '../db.mjs';
import { assert } from '../security.mjs';

// A single application process publishes tiny invalidation hints. Message
// content remains in authenticated database endpoints, never in this stream.
const clients = new Map();
let total = 0;
const maxPerUser = 4,
  maxTotal = 100;

function remove(entry) {
  if (entry.closed) return;
  entry.closed = true;
  clearInterval(entry.timer);
  const group = clients.get(entry.userId);
  group?.delete(entry);
  if (!group?.size) clients.delete(entry.userId);
  total--;
  if (!entry.res.writableEnded && !entry.res.destroyed) entry.res.end();
}
function write(entry, text) {
  if (entry.closed || entry.res.destroyed || entry.res.writableEnded) {
    remove(entry);
    return;
  }
  try {
    // A slow browser cannot accumulate an unbounded buffer of refresh hints.
    if (!entry.res.write(text)) remove(entry);
  } catch {
    remove(entry);
  }
}
export function publishChatChange(...userIds) {
  for (const userId of new Set(userIds))
    for (const entry of clients.get(userId) || []) write(entry, 'event: change\ndata: {}\n\n');
}

// Long-lived streams must end before HTTP graceful shutdown can finish.
export function closeChatEvents() {
  for (const group of [...clients.values()]) for (const entry of [...group]) remove(entry);
}

export function subscribeChatEvents(req, res) {
  const userId = req.user.id,
    group = clients.get(userId) || new Set();
  assert(
    group.size < maxPerUser && total < maxTotal,
    429,
    '聊天实时连接过多，请关闭多余页面后重试',
  );
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'private, no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const entry = { res, userId, closed: false, checking: false, timer: undefined };
  group.add(entry);
  clients.set(userId, group);
  total++;
  res.on('close', () => remove(entry));
  write(entry, 'retry: 5000\nevent: ready\ndata: {}\n\n');
  if (entry.closed) return;
  entry.timer = setInterval(async () => {
    if (entry.closed || entry.checking) return;
    entry.checking = true;
    try {
      const [session] = await query(
        "SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>UTC_TIMESTAMP(3) AND u.status='active'",
        [req.user.token_hash, userId],
      );
      if (!session) remove(entry);
      else write(entry, ': heartbeat\n\n');
    } catch {
      remove(entry);
    } finally {
      entry.checking = false;
    }
  }, 25000);
  entry.timer.unref();
}
