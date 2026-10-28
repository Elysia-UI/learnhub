import mysql from 'mysql2/promise';
import { createWriteStream } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { config, root } from '../server/config.mjs';

// This is a read-only consistent snapshot. Restore only into a NEW empty schema.
const destination = path.resolve(process.argv[2] || '.local/backups');
if (
  destination === path.join(root, 'dist') ||
  destination.startsWith(path.join(root, 'dist') + path.sep)
)
  throw new Error('备份不得写入公开目录');
await mkdir(destination, { recursive: true, mode: 0o700 });
const name = `${config.db.database}-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.sql.gz`;
const target = path.join(destination, name);
const output = createWriteStream(target + '.partial', { flags: 'wx', mode: 0o600 });
const gzip = createGzip();
const completion = pipeline(gzip, output);
// Register immediately so a disk error cannot turn into an unhandled rejection.
completion.catch(() => {});
const connection = await mysql.createConnection({
  ...config.db,
  dateStrings: true,
  decimalNumbers: false,
  supportBigNumbers: true,
  bigNumberStrings: true,
});
async function write(text) {
  if (!gzip.write(text)) await once(gzip, 'drain');
}
let count = 0;
try {
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const [tables] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",
    [config.db.database],
  );
  await write(
    "-- LearnHub consistent backup. Restore into a NEW empty schema only.\nSET NAMES utf8mb4;\nSET sql_mode='NO_AUTO_VALUE_ON_ZERO';\nSET time_zone='+00:00';\nSET FOREIGN_KEY_CHECKS=0;\n",
  );
  for (const { TABLE_NAME: table } of tables) {
    const identifier = mysql.escapeId(table);
    const [create] = await connection.query(`SHOW CREATE TABLE ${identifier}`);
    await write(`\n${create[0]['Create Table']};\n`);
    const [rows] = await connection.query(`SELECT * FROM ${identifier}`);
    for (const row of rows) {
      const columns = Object.keys(row);
      const values = columns.map((column) => {
        const value = row[column];
        return mysql.escape(
          value && typeof value === 'object' && !Buffer.isBuffer(value)
            ? JSON.stringify(value)
            : value,
        );
      });
      await write(
        `INSERT INTO ${identifier} (${columns.map((column) => mysql.escapeId(column)).join(',')}) VALUES (${values.join(',')});\n`,
      );
      count++;
    }
  }
  await write('\nSET FOREIGN_KEY_CHECKS=1;\n');
  await connection.commit();
  gzip.end();
  await completion;
  await rename(target + '.partial', target);
  console.log(
    JSON.stringify({ backup: target, tables: tables.length, rows: count, businessWrites: 0 }),
  );
} catch (error) {
  await connection.rollback().catch(() => {});
  gzip.destroy();
  output.destroy();
  throw error;
} finally {
  await connection.end();
}
