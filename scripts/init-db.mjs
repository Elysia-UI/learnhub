import 'dotenv/config';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (!process.env.DB_HOST && !existsSync('.local/database.dpapi')) {
  const result = spawnSync(process.execPath, ['scripts/provision.mjs'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
const { seed } = await import('../server/seed.mjs');
const { pool } = await import('../server/db.mjs');
try {
  await seed();
} finally {
  await pool.end();
}
