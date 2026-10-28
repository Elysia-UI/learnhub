import { Router } from 'express';
import { z } from 'zod';
import { auth, assert, idSchema, pageParams, validate } from '../security.mjs';
import { config } from '../config.mjs';
import {
  chatUnreadCount,
  listThreads,
  listMessages,
  sendMessage,
  readMessages,
} from '../services/chat.mjs';
import { publishChatChange, subscribeChatEvents } from '../services/chat-events.mjs';

export const chatRoutes = Router();
chatRoutes.use('/chat', auth);
const decimalId = z
  .string()
  .refine(
    (v) => /^(0|[1-9][0-9]{0,19})$/.test(v) && BigInt(v) <= 18446744073709551615n,
    '消息标识无效',
  );
const messageQuery = z
  .object({
    before: decimalId.optional(),
    after: decimalId.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .strict()
  .refine((v) => v.before === undefined || v.after === undefined, '不能同时指定前后游标');
const messageBody = z
  .object({
    content: z.string().trim().min(1, '消息不能为空').max(2000, '消息最多 2000 个字'),
    clientId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/, '发送标识无效'),
  })
  .strict();
function respond(res, data, status = 200) {
  res.set('Cache-Control', 'private, no-store').status(status).json({ data });
}

chatRoutes.get('/chat/events', (req, res) => {
  assert(!req.get('origin') || config.origins.includes(req.get('origin')), 403, '请求来源不被允许');
  subscribeChatEvents(req, res);
});
chatRoutes.get('/chat/unread', async (req, res) =>
  respond(res, { count: await chatUnreadCount(req.user.id) }),
);
chatRoutes.get('/chat/threads', async (req, res) => {
  const f = pageParams({ ...req.query, pageSize: req.query.pageSize ?? 20 });
  respond(res, await listThreads(req.user.id, f));
});
chatRoutes.get('/chat/threads/:peerId/messages', async (req, res) => {
  const peerId = validate(idSchema, req.params.peerId),
    args = validate(messageQuery, req.query);
  respond(res, await listMessages(req.user.id, peerId, args));
});
chatRoutes.post('/chat/threads/:peerId/messages', async (req, res) => {
  const peerId = validate(idSchema, req.params.peerId),
    body = validate(messageBody, req.body);
  const result = await sendMessage(req.user.id, peerId, body);
  // Publish only after the transaction has committed and only for a new row.
  if (result.created) publishChatChange(req.user.id, result.peerId);
  respond(
    res,
    { message: result.message, peerReadUpTo: result.peerReadUpTo },
    result.created ? 201 : 200,
  );
});
chatRoutes.put('/chat/threads/:peerId/read', async (req, res) => {
  const peerId = validate(idSchema, req.params.peerId);
  const { upToId } = validate(z.object({ upToId: decimalId }).strict(), req.body);
  const result = await readMessages(req.user.id, peerId, upToId);
  if (result.changed) publishChatChange(req.user.id, result.peerId);
  respond(res, { unreadCount: result.unreadCount });
});
