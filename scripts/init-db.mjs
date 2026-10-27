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
const { query, transaction } = await import('../server/db.mjs');
const { syncBadges } = await import('../server/services/activity.mjs');
try {
  await seed();
  for (const user of await query('SELECT id FROM users'))
    await transaction((c) => syncBadges(c, user.id));
} finally {
  await pool.end();
}
