import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { query, transaction } from '../db.mjs';
import {
  auth,
  validate,
  passwordSchema,
  emailSchema,
  hashPassword,
  verifyPassword,
  publicUser,
  createSession,
  uid,
  assert,
} from '../security.mjs';
import { config } from '../config.mjs';
export const authRoutes = Router();
const limit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: '登录或注册过于频繁，请稍后再试' } },
});
authRoutes.post('/register', limit, async (req, res) => {
  const input = validate(
    z
      .object({
        email: emailSchema,
        name: z.string().trim().min(2).max(30),
        password: passwordSchema,
      })
      .strict(),
    req.body,
  );
  assert(
    !(await query('SELECT id FROM users WHERE email=?', [input.email])).length,
    409,
    '该邮箱已经注册',
  );
  const id = uid('user'),
    hash = await hashPassword(input.password);
  await transaction(async (c) => {
    await query(
      "INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,'student')",
      [id, input.email, input.name, hash],
      c,
    );
    await query(
      'INSERT INTO notifications(id,user_id,title,content,type,link) VALUES(?,?,?,?,?,?)',
      [
        uid('notice'),
        id,
        '欢迎加入知学社区',
        '从一篇分享、一门课程开始你的学习旅程。',
        'system',
        '/courses',
      ],
      c,
    );
  });
  const csrfToken = await createSession(res, id);
  const [user] = await query('SELECT * FROM users WHERE id=?', [id]);
  res.status(201).json({ data: { user: publicUser(user), csrfToken } });
});
authRoutes.post('/login', limit, async (req, res) => {
  const input = validate(
    z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict(),
    req.body,
  );
  const [user] = await query('SELECT * FROM users WHERE email=?', [input.email]);
  // Perform a full password derivation for unknown accounts as well.
  const valid = user
    ? await verifyPassword(input.password, user.password_hash)
    : (await hashPassword(input.password), false);
  assert(valid && user.status === 'active', 401, '邮箱或密码不正确，或账号已停用');
  const csrfToken = await createSession(res, user.id);
  res.json({ data: { user: publicUser(user), csrfToken } });
});
authRoutes.get('/me', async (req, res) =>
  res.json({
    data: {
      user: req.user ? { ...publicUser(req.user), email: req.user.email } : null,
      csrfToken: req.user?.csrf_token || '',
    },
  }),
);
authRoutes.post('/logout', auth, async (req, res) => {
  await query('DELETE FROM sessions WHERE token_hash=?', [req.user.token_hash]);
  res.clearCookie(config.cookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.production,
    path: '/',
  });
  res.json({ data: { ok: true } });
});
authRoutes.patch('/profile', auth, async (req, res) => {
  const value = validate(
    z
      .object({
        name: z.string().trim().min(2).max(30),
        bio: z.string().trim().max(160),
        avatar: z
          .string()
          .max(512)
          .optional()
          .refine(
            (v) => !v || v === req.user.avatar || /^\/api\/uploads\/[a-zA-Z0-9_.-]+$/.test(v),
            '头像地址无效',
          ),
      })
      .strict(),
    req.body,
  );
  await query('UPDATE users SET name=?,bio=?,avatar=COALESCE(?,avatar) WHERE id=?', [
    value.name,
    value.bio,
    value.avatar ?? null,
    req.user.id,
  ]);
  res.json({ data: { ok: true } });
});
authRoutes.post('/password', auth, limit, async (req, res) => {
  const input = validate(
    z.object({ currentPassword: z.string().max(128), newPassword: passwordSchema }).strict(),
    req.body,
  );
  assert(
    await verifyPassword(input.currentPassword, req.user.password_hash),
    400,
    '当前密码不正确',
  );
  await transaction(async (c) => {
    await query(
      'UPDATE users SET password_hash=? WHERE id=?',
      [await hashPassword(input.newPassword), req.user.id],
      c,
    );
    await query('DELETE FROM sessions WHERE user_id=?', [req.user.id], c);
  });
  res.clearCookie(config.cookie, { path: '/' });
  res.json({ data: { ok: true } });
});
