import { Router } from 'express';
import { z } from 'zod';
import { query, transaction, iso } from '../db.mjs';
import { auth, assert, validate, uid, idSchema, pageParams } from '../security.mjs';
export const aiRoutes = Router();
const running = new Map();
export function aiSettings() {
  const base = process.env.AI_BASE_URL?.trim(),
    key = process.env.AI_API_KEY?.trim(),
    model = process.env.AI_MODEL?.trim();
  let valid = false;
  try {
    const url = new URL(base);
    valid =
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  } catch {}
  return { configured: !!(valid && key && model), base, key, model };
}
aiRoutes.get('/ai/status', (_req, res) => {
  const s = aiSettings();
  res.json({
    data: {
      configured: s.configured,
      model: s.configured ? s.model : null,
      message: s.configured
        ? '模型服务已配置'
        : '请在服务端 .env 配置 AI_BASE_URL、AI_API_KEY、AI_MODEL 后重启。密钥不能填写在前端。',
    },
  });
});
async function owned(id, userId, conn) {
  const [c] = await query(
    "SELECT * FROM ai_conversations WHERE id=? AND user_id=? AND kind='chat'",
    [id, userId],
    conn,
  );
  assert(c, 404, '对话不存在');
  return c;
}
aiRoutes.get('/ai/conversations', auth, async (req, res) => {
  const f = pageParams(req.query),
    [n] = await query(
      "SELECT COUNT(*) AS n FROM ai_conversations WHERE user_id=? AND kind='chat'",
      [req.user.id],
    );
  const rows = await query(
    `SELECT id,title,created_at,updated_at FROM ai_conversations WHERE user_id=? AND kind='chat' ORDER BY updated_at DESC,id LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    [req.user.id],
  );
  res.json({
    data: {
      items: rows.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: iso(c.created_at),
        updatedAt: iso(c.updated_at),
      })),
      total: Number(n.n),
    },
  });
});
aiRoutes.post('/ai/conversations', auth, async (req, res) => {
  const v = validate(
      z.object({ title: z.string().trim().max(100).default('新的学习对话') }).strict(),
      req.body || {},
    ),
    id = uid('chat');
  await query(
    "INSERT INTO ai_conversations(id,user_id,title,messages,kind) VALUES(?,?,?,'[]','chat')",
    [id, req.user.id, v.title || '新的学习对话'],
  );
  res.status(201).json({ data: { id } });
});
aiRoutes.get('/ai/conversations/:id', auth, async (req, res) => {
  const c = await owned(req.params.id, req.user.id),
    rows = await query('SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY sequence_id', [
      c.id,
    ]);
  res.json({
    data: {
      id: c.id,
      title: c.title,
      messages: rows.map((m) => ({
        id: m.id,
        requestKey: m.request_key,
        role: m.role,
        content: m.content,
        status: m.status,
        error: m.error,
        createdAt: iso(m.created_at),
      })),
    },
  });
});
aiRoutes.delete('/ai/conversations/:id', auth, async (req, res) => {
  await owned(req.params.id, req.user.id);
  running.get(req.params.id)?.abort();
  await query('DELETE FROM ai_conversations WHERE id=? AND user_id=?', [
    req.params.id,
    req.user.id,
  ]);
  res.json({ data: { ok: true } });
});
aiRoutes.post('/ai/conversations/:id/stop', auth, async (req, res) => {
  await owned(req.params.id, req.user.id);
  running.get(req.params.id)?.abort();
  res.json({ data: { ok: true } });
});
async function chat(req, res) {
  const s = aiSettings();
  assert(
    s.configured,
    503,
    '模型尚未配置，请在服务端设置 AI_BASE_URL、AI_API_KEY、AI_MODEL 后重启',
  );
  const v = validate(
    z
      .object({
        content: z.string().trim().min(1).max(12000),
        requestKey: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
        conversationId: idSchema.optional(),
      })
      .strict(),
    req.body,
  );
  const id = req.params.id || v.conversationId;
  assert(id, 400, '请选择对话');
  let assistantId, history, cached;
  await transaction(async (c) => {
    await query(
      "SELECT id FROM ai_conversations WHERE id=? AND user_id=? AND kind='chat' FOR UPDATE",
      [id, req.user.id],
      c,
    );
    const conv = await owned(id, req.user.id, c);
    const old = await query(
      'SELECT * FROM ai_messages WHERE conversation_id=? AND request_key=?',
      [id, v.requestKey],
      c,
    );
    if (old.length) {
      assert(
        old.find((m) => m.role === 'user')?.content === v.content,
        409,
        '重试内容与原请求不一致',
      );
      const a = old.find((m) => m.role === 'assistant');
      if (a?.status === 'complete') {
        cached = a.content;
        return;
      }
      const [latest] = await query(
        "SELECT request_key FROM ai_messages WHERE conversation_id=? AND role='user' ORDER BY sequence_id DESC LIMIT 1",
        [id],
        c,
      );
      assert(latest?.request_key === v.requestKey, 409, '只能重试最后一条消息');
    }
    const [pending] = await query(
      "SELECT COUNT(*) AS n FROM ai_messages WHERE conversation_id=? AND status='pending' AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 150 SECOND)",
      [id],
      c,
    );
    assert(!pending.n, 409, '这个对话正在生成回答，请先停止或等待完成');
    await query(
      "UPDATE ai_messages SET status='failed',error='上次生成中断，可重试' WHERE conversation_id=? AND status='pending'",
      [id],
      c,
    );
    // Serialize each user's quota across simultaneous conversations.
    await query('SELECT id FROM users WHERE id=? FOR UPDATE', [req.user.id], c);
    const [quota] = await query(
      `SELECT SUM(created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)) AS minute,COUNT(*) AS day FROM ai_attempts WHERE user_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY)`,
      [req.user.id],
      c,
    );
    assert(
      Number(quota.minute) < 10 && quota.day < 100,
      429,
      'AI 调用已达到限制（每分钟 10 条、每日 100 条）',
    );
    await query(
      'INSERT INTO ai_attempts(id,user_id) VALUES(?,?)',
      [uid('attempt'), req.user.id],
      c,
    );
    assistantId = old.find((m) => m.role === 'assistant')?.id || uid('message');
    if (!old.length)
      await query(
        "INSERT INTO ai_messages(id,conversation_id,request_key,role,content) VALUES(?,?,?,'user',?)",
        [uid('message'), id, v.requestKey, v.content],
        c,
      );
    await query(
      "INSERT INTO ai_messages(id,conversation_id,request_key,role,content,status) VALUES(?,?,?,'assistant','','pending') ON DUPLICATE KEY UPDATE content='',status='pending',error='',created_at=UTC_TIMESTAMP(3)",
      [assistantId, id, v.requestKey],
      c,
    );
    history = await query(
      "SELECT role,content FROM ai_messages WHERE conversation_id=? AND (role='user' OR status='complete') ORDER BY sequence_id DESC LIMIT 20",
      [id],
      c,
    );
    history.reverse();
    while (history.reduce((n, m) => n + m.content.length, 0) > 32000 && history.length > 1)
      history.shift();
    await query(
      "UPDATE ai_conversations SET title=IF(title='新的学习对话',?,title),updated_at=UTC_TIMESTAMP(3) WHERE id=?",
      [v.content.slice(0, 40), conv.id],
      c,
    );
  });
  res.set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const send = (data) => {
    if (!res.destroyed) res.write(JSON.stringify(data) + '\n');
  };
  if (cached !== undefined) {
    send({ type: 'delta', content: cached });
    send({ type: 'done' });
    return res.end();
  }
  const controller = new AbortController();
  running.set(id, controller);
  const disconnect = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', disconnect);
  const timeout = setTimeout(() => controller.abort(new Error('模型响应超时')), 120000);
  let content = '',
    status = 'complete',
    error = '',
    finished = false;
  send({ type: 'start', messageId: assistantId });
  try {
    const upstream = await fetch(s.base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: s.model,
        stream: true,
        max_tokens: 2048,
        messages: [
          {
            role: 'system',
            content:
              '你是 LearnHub 知学社区的学习助手。用清楚、准确的中文帮助用户理解知识、制定学习计划和分析代码。不编造资料来源。',
          },
          ...history.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });
    assert(
      upstream.ok,
      502,
      upstream.status === 401 || upstream.status === 403
        ? '模型服务认证失败，请管理员检查服务端配置'
        : upstream.status === 429
          ? '模型服务限流，请稍后重试'
          : '模型服务调用失败，请稍后重试',
    );
    assert(upstream.body, 502, '模型没有返回内容');
    const decoder = new TextDecoder();
    let buffer = '';
    function line(text) {
      if (!text.startsWith('data:')) return;
      const payload = text.slice(5).trim();
      if (!payload) return;
      if (payload === '[DONE]') {
        finished = true;
        return;
      }
      const chunk = JSON.parse(payload);
      assert(!chunk.error, 502, '模型生成失败');
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) finished = true;
      const delta = choice?.delta?.content;
      if (typeof delta === 'string') {
        content += delta;
        assert(content.length <= 60000, 502, '模型回答超过长度限制');
        send({ type: 'delta', content: delta });
      }
    }
    for await (const bytes of upstream.body) {
      buffer += decoder.decode(bytes, { stream: true });
      assert(buffer.length <= 1000000, 502, '模型返回数据过大');
      let split;
      while ((split = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, split).replace(/\r$/, ''));
        buffer = buffer.slice(split + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) line(buffer.trim());
    assert(content.trim() && finished, 502, '模型返回中断或内容为空，请重试');
  } catch (e) {
    status = controller.signal.aborted ? 'cancelled' : 'failed';
    error = controller.signal.aborted
      ? '生成已停止，可重试'
      : e.status
        ? e.message
        : '无法连接模型服务，请管理员检查网络和服务端配置';
  } finally {
    clearTimeout(timeout);
    res.off('close', disconnect);
    if (running.get(id) === controller) running.delete(id);
  }
  await query('UPDATE ai_messages SET content=?,status=?,error=? WHERE id=?', [
    content,
    status,
    error,
    assistantId,
  ]);
  send({ type: status === 'complete' ? 'done' : 'error', status, message: error });
  res.end();
}
aiRoutes.post('/ai/conversations/:id/messages', auth, chat);
aiRoutes.post('/ai/chat', auth, chat);
