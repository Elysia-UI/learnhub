import { spawnSync } from 'node:child_process';
import path from 'node:path';
import 'dotenv/config';
if (process.platform !== 'win32')
  throw new Error('非 Windows 部署请先创建独立 learnhub 库并设置 DB_* 服务端环境变量');
const python =
  process.env.DB_PYTHON ||
  'python';
const result = spawnSync(python, ['-X', 'utf8', path.resolve('scripts/provision-cloud.py')], {
  stdio: 'inherit',
  windowsHide: true,
});
process.exitCode = result.status ?? 1;
