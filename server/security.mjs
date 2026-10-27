import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  randomUUID,
} from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { config } from './config.mjs';
import { query } from './db.mjs';
const scrypt = promisify(scryptCallback);
export const uid = (prefix) => `${prefix}-${randomUUID()}`;
export const hashToken = (value) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  const [scheme, salt, key] = String(hash).split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = await scrypt(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const assert = (condition, status, message) => {
  if (!condition) throw new HttpError(status, message);
};
export const passwordSchema = z
  .string()
  .min(12, '密码至少 12 位')
  .max(128)
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), '密码须包含字母和数字');
export const emailSchema = z.string().trim().toLowerCase().email('请输入有效邮箱').max(190);
export const tagsSchema = z.array(z.string().trim().min(1).max(30)).max(5).default([]);
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const validate = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(400, result.error.issues[0]?.message || '参数不正确', 'VALIDATION_ERROR');
  return result.data;
};
export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  avatar: u.avatar,
  bio: u.bio,
  role: u.role,
  points: u.points,
  status: u.status,
  joined: new Date(u.created_at).toISOString(),
});
export async function authenticate(req, _res, next) {
  try {
    const token = req.cookies[config.cookie];
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const rows = await query(
        "SELECT u.*,s.csrf_token,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND u.status='active'",
        [hashToken(token)],
      );
      if (rows[0]) req.user = rows[0];
    }
    next();
  } catch (e) {
    next(e);
  }
}
export function auth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, '请先登录', 'AUTH_REQUIRED'));
  next();
}
export function role(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, '请先登录'));
    if (!roles.includes(req.user.role))
      return next(new HttpError(403, '没有操作权限', 'FORBIDDEN'));
    next();
  };
}
export function csrf(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!config.origins.includes(req.get('origin') || ''))
    return next(new HttpError(403, '请求来源不被允许', 'INVALID_ORIGIN'));
  if (
    req.user &&
    !['/auth/login', '/auth/register'].includes(req.path) &&
    req.get('x-csrf-token') !== req.user.csrf_token
  )
    return next(new HttpError(403, '登录校验已更新，请刷新后重试', 'CSRF_INVALID'));
  next();
}
export async function createSession(res, userId) {
  const token = randomBytes(32).toString('hex'),
    csrfToken = randomBytes(32).toString('hex');
  await query(
    'INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY))',
    [hashToken(token), userId, csrfToken],
  );
  res.cookie(config.cookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.production,
    maxAge: 7 * 86400000,
    path: '/',
  });
  return csrfToken;
}
export function pageParams(value) {
  return validate(
    z.object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(8),
      q: z.string().max(100).default(''),
      category: z.string().max(64).default('all'),
      sort: z.enum(['latest', 'hot', 'featured']).default('latest'),
    }),
    value,
  );
}
export function owner(req, authorId) {
  assert(req.user?.id === authorId || req.user?.role === 'admin', 403, '只能修改自己的内容');
}
