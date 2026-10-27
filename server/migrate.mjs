import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool, query } from './db.mjs';
import { root } from './config.mjs';
export async function migrate() {
  await query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(150) PRIMARY KEY,applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB',
  );
  for (const name of (await readdir(path.join(root, 'server/migrations')))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    if ((await query('SELECT name FROM schema_migrations WHERE name=?', [name])).length) continue;
    const content = await readFile(path.join(root, 'server/migrations', name), 'utf8');
    for (const sql of content
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await query(sql);
    await query('INSERT INTO schema_migrations(name) VALUES(?)', [name]);
    console.log(`Migration applied: ${name}`);
  }
}
if (process.argv[1]?.endsWith('migrate.mjs')) {
  try {
    await migrate();
  } finally {
    await pool.end();
  }
}
