import { writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { query, pool } from '../server/db.mjs';
import { root, storageDir } from '../server/config.mjs';

// Read-only verification. This tool never resets application records or prints secrets.
const minimums = {
  users: 30,
  posts: 100,
  post_comments: 300,
  courses: 20,
  course_chapters: 80,
  resources: 50,
  questions: 30,
  answers: 60,
};
try {
  const [connection] = await query('SELECT DATABASE() AS name, VERSION() AS version');
  const counts = Object.fromEntries(
    await Promise.all(
      Object.keys(minimums).map(async (table) => [
        table,
        (await query(`SELECT COUNT(*) AS n FROM ${table}`))[0].n,
      ]),
    ),
  );
  const [integrity] = await query(`SELECT
    (SELECT COUNT(*) FROM post_comments c JOIN post_comments p ON p.id=c.parent_id WHERE c.post_id<>p.post_id) AS invalidReplies,
    (SELECT COUNT(*) FROM questions q LEFT JOIN answers a ON a.id=q.accepted_answer_id WHERE q.accepted_answer_id IS NOT NULL AND (a.id IS NULL OR a.question_id<>q.id)) AS invalidAcceptedAnswers,
    (SELECT COUNT(*) FROM learning_progress p JOIN course_chapters c ON c.id=p.chapter_id WHERE p.course_id<>c.course_id) AS invalidProgress,
    (SELECT COUNT(*) FROM users u WHERE u.points<>COALESCE((SELECT SUM(amount) FROM point_records p WHERE p.user_id=u.id),0)) AS inconsistentPoints,
    (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()) AS foreignKeys`);
  const files = await query('SELECT storage_key,byte_size FROM resources');
  let validFiles = 0;
  const missingFiles = [];
  for (const file of files) {
    const resolved = path.resolve(storageDir, file.storage_key);
    if (!resolved.startsWith(storageDir + path.sep)) {
      missingFiles.push(file.storage_key);
      continue;
    }
    try {
      if ((await stat(resolved)).size === file.byte_size && file.byte_size > 0) validFiles++;
      else missingFiles.push(file.storage_key);
    } catch {
      missingFiles.push(file.storage_key);
    }
  }
  const grants = (await query('SHOW GRANTS FOR CURRENT_USER')).map((r) => Object.values(r)[0]);
  const onlyProjectPrivileges = grants.every(
    (g) =>
      /^GRANT USAGE ON/.test(g) ||
      (g.includes(`ON \`${connection.name}\`.*`) && !g.includes('GRANT OPTION')),
  );
  const migrations = await query('SELECT name,applied_at FROM schema_migrations ORDER BY name');
  const passed =
    Object.entries(minimums).every(([k, n]) => counts[k] >= n) &&
    integrity.foreignKeys > 0 &&
    Object.entries(integrity).every(([k, n]) => k === 'foreignKeys' || n === 0) &&
    missingFiles.length === 0 &&
    onlyProjectPrivileges;
  const report = {
    checkedAt: new Date().toISOString(),
    database: connection.name,
    version: connection.version,
    counts,
    minimums,
    integrity,
    files: { expected: files.length, verified: validFiles, missingFiles },
    onlyProjectPrivileges,
    migrations,
    passed,
  };
  await writeFile(
    path.join(root, 'docs/backend-verification.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await pool.end();
}
