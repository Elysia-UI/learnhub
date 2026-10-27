import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, root } from './config.mjs';
import { query } from './db.mjs';
import { authenticate, csrf, HttpError } from './security.mjs';
import { snapshot, stats } from './services/snapshot.mjs';
import { authRoutes } from './routes/auth.mjs';
import { forumRoutes } from './routes/forum.mjs';
import { learningRoutes } from './routes/learning.mjs';
import { resourceRoutes } from './routes/resources.mjs';
import { adminRoutes } from './routes/admin.mjs';
export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: config.production
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
          },
        }
      : false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }),
);
app.use(
  '/api',
  rateLimit({
    windowMs: 60000,
    limit: Number(process.env.API_RATE_LIMIT || 600),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后再试' } },
  }),
);
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && config.origins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.vary('Origin');
  }
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.get('/api/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ data: { ok: true, database: 'connected', mode: 'cloud-mysql', aiConfigured: false } });
});
app.use('/api', authenticate, csrf);
app.use('/api/auth', authRoutes);
app.use('/api', forumRoutes, learningRoutes, resourceRoutes);
app.use('/api/admin', adminRoutes);
app.get('/api/bootstrap', async (req, res) =>
  res.json({
    data: {
      state: await snapshot(req.user),
      user: req.user ? { id: req.user.id, email: req.user.email } : null,
      csrfToken: req.user?.csrf_token || '',
      aiConfigured: false,
    },
  }),
);
app.get('/api/stats', async (_req, res) => res.json({ data: await stats() }));
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '')
      .slice(0, 100)
      .trim()
      .toLowerCase(),
    type = String(req.query.type || '全部'),
    page = Math.max(1, Math.min(100000, Number(req.query.page) || 1)),
    size = Math.max(1, Math.min(50, Number(req.query.pageSize) || 8));
  const data = await snapshot(req.user);
  const list = q
    ? [
        ...data.posts.map((item) => ({
          type: '帖子',
          item,
          text: `${item.title} ${item.content} ${item.tags.join(' ')}`,
        })),
        ...data.questions.map((item) => ({
          type: '问答',
          item,
          text: `${item.title} ${item.content} ${item.tags.join(' ')}`,
        })),
        ...data.courses.map((item) => ({
          type: '课程',
          item,
          text: `${item.title} ${item.description}`,
        })),
        ...data.resources.map((item) => ({
          type: '资源',
          item,
          text: `${item.title} ${item.description}`,
        })),
        ...data.users.map((item) => ({ type: '用户', item, text: `${item.name} ${item.bio}` })),
      ].filter((r) => r.text.toLowerCase().includes(q))
    : [];
  const filtered = list.filter((r) => type === '全部' || r.type === type);
  res.json({
    data: {
      items: filtered.slice((page - 1) * size, page * size).map(({ text, ...r }) => r),
      total: filtered.length,
      counts: Object.fromEntries(
        ['帖子', '问答', '课程', '资源', '用户'].map((t) => [
          t,
          list.filter((r) => r.type === t).length,
        ]),
      ),
      page,
      pageSize: size,
    },
  });
});
app.use('/api', (_req, _res, next) => next(new HttpError(404, '接口不存在', 'NOT_FOUND')));
if (config.production) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
}
app.use((error, req, res, _next) => {
  const status =
    error.status ||
    (error.code === 'ER_DUP_ENTRY'
      ? 409
      : error.code === 'ER_ROW_IS_REFERENCED_2'
        ? 409
        : error.code?.startsWith('LIMIT_')
          ? 400
          : 500);
  if (status >= 500)
    console.error(
      JSON.stringify({
        requestId: req.requestId,
        code: error.code || error.name,
        message: 'API request failed',
      }),
    );
  res.status(status).json({
    error: {
      code: status >= 500 ? 'SERVER_ERROR' : error.code || 'REQUEST_FAILED',
      message:
        status >= 500
          ? '服务暂时不可用，请稍后重试'
          : error.code === 'ER_DUP_ENTRY'
            ? '数据已经存在'
            : error.code === 'ER_ROW_IS_REFERENCED_2'
              ? '内容仍被其他数据引用'
              : error.code === 'LIMIT_FILE_SIZE'
                ? '附件不能超过 10 MB'
                : error.code?.startsWith('LIMIT_')
                  ? '上传字段或文件数量不符合要求'
                  : error.message,
    },
    requestId: req.requestId,
  });
});
