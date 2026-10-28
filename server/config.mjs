import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

// Trust only the local reverse proxy by default. Never accept Express's broad
// boolean/number shortcuts from environment configuration.
export function parseTrustProxy(value) {
  const configured = (value || 'loopback').trim();
  if (['off', 'false'].includes(configured)) return false;
  const entries = configured.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    if (entry === 'loopback') continue;
    const parts = entry.split('/');
    const version = isIP(parts[0]);
    if (!version || parts.length > 2)
      throw new Error('TRUST_PROXY 仅允许 loopback、off 或明确的 IP/CIDR');
    if (parts.length === 2) {
      const prefix = parts[1];
      if (
        !/^\d+$/.test(prefix) ||
        Number(prefix) < 1 ||
        Number(prefix) > (version === 4 ? 32 : 128)
      )
        throw new Error('TRUST_PROXY 禁止全部网络及无效 CIDR');
    }
  }
  return entries.length === 1 ? entries[0] : entries;
}

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const privateDir = path.join(root, '.local');
export const storageDir = path.resolve(root, process.env.STORAGE_DIR || '.storage');
mkdirSync(privateDir, { recursive: true });
mkdirSync(storageDir, { recursive: true });
export const python =
  process.env.DB_PYTHON ||
  'python';
export const privateFile = (filename) =>
  path.join(
    privateDir,
    process.platform === 'win32' ? filename : filename.replace(/\.dpapi$/, '.json'),
  );
export function privateRead(filename) {
  if (process.platform !== 'win32') return JSON.parse(readFileSync(privateFile(filename), 'utf8'));
  const result = spawnSync(
    python,
    [
      '-X',
      'utf8',
      path.join(root, 'scripts/secret-store.py'),
      'read',
      path.join(privateDir, filename),
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0)
    throw new Error('无法读取项目加密配置，请执行 npm run db:provision 或设置服务端环境变量');
  return JSON.parse(result.stdout);
}
export function privateWrite(filename, value) {
  if (process.platform !== 'win32') {
    writeFileSync(privateFile(filename), JSON.stringify(value), { mode: 0o600 });
    return;
  }
  const result = spawnSync(
    python,
    [
      '-X',
      'utf8',
      path.join(root, 'scripts/secret-store.py'),
      'write',
      path.join(privateDir, filename),
    ],
    { input: JSON.stringify(value), encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) throw new Error('写入加密凭据失败');
}
const db = process.env.DB_HOST
  ? {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'learnhub',
    }
  : existsSync(path.join(privateDir, 'database.dpapi'))
    ? privateRead('database.dpapi')
    : null;
if (!db) throw new Error('尚未配置 LearnHub 数据库，请执行 npm run db:provision');
if (db.database !== 'learnhub' && !/^learnhub_[a-z0-9_]+$/.test(db.database))
  throw new Error('拒绝连接非 LearnHub 数据库');
if (
  process.env.NODE_ENV === 'production' &&
  !['127.0.0.1', 'localhost', '::1'].includes(db.host) &&
  process.env.DB_SSL !== 'true'
)
  throw new Error(
    '正式部署连接远程数据库必须配置 DB_SSL=true 和可信 CA，禁止使用明文公网数据库连接',
  );
export const config = {
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  db: {
    ...db,
    charset: 'utf8mb4',
    timezone: 'Z',
    connectionLimit: 8,
    waitForConnections: true,
    connectTimeout: 10000,
    multipleStatements: false,
    decimalNumbers: true,
    ...(process.env.DB_SSL === 'true'
      ? {
          ssl: {
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2',
            ...(process.env.DB_SSL_CA ? { ca: readFileSync(process.env.DB_SSL_CA) } : {}),
          },
        }
      : {}),
  },
  port: Number(process.env.API_PORT || 3001),
  host: process.env.API_HOST || '127.0.0.1',
  origins: (
    process.env.APP_ORIGINS ||
    'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3001,http://127.0.0.1:4173'
  )
    .split(',')
    .map((s) => s.trim()),
  production: process.env.NODE_ENV === 'production',
  cookie: 'learnhub_session',
};
