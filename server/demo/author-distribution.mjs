import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { query, transaction } from '../db.mjs';
import { privateDir, root } from '../config.mjs';
import { posts } from './posts.mjs';
const marker = 'learnhub-community-author-variety-v2';
const rosters = {
  method: [1, 15, 8, 22, 25, 24, 29, 12, 28, 5, 10, 23],
  ai: [4, 2, 9, 29, 13, 7, 20, 27, 12, 18],
  tech: [2, 9, 20, 12, 27, 29, 13, 17, 7, 18, 1, 22],
  design: [3, 6, 11, 16, 26, 13, 20, 24, 8],
  career: [18, 2, 27, 19, 20, 7, 1, 6, 22],
  campus: [8, 19, 27, 15, 24, 5, 11, 28, 16],
  life: [5, 17, 10, 14, 21, 16, 23, 26, 28, 24, 3, 29, 15, 1],
};
export async function diversifyDemoAuthors() {
  if ((await query('SELECT name FROM seed_runs WHERE name=?', [marker])).length) return;
  const catalog = new Map(posts.map((p, i) => [i < 100 ? p.id : `demo-v2-post-${i + 1}`, p]));
  const rows = await query(
    "SELECT id,author_id,title,content,category_id FROM posts WHERE id REGEXP '^p[0-9]+$' OR id LIKE 'demo-v2-post-%' ORDER BY pinned DESC,created_at DESC,id",
  );
  const counters = {},
    changes = [];
  for (const row of rows) {
    const p = catalog.get(row.id);
    if (
      !p ||
      row.title !== p.title ||
      row.content !== p.content ||
      row.category_id !== p.category ||
      !/^u\d+$/.test(row.author_id)
    )
      continue;
    const roster = rosters[p.category],
      slot = counters[p.category] || 0;
    counters[p.category] = slot + 1;
    const author = `u${roster[slot % roster.length]}`;
    if (author !== row.author_id) changes.push({ id: row.id, previous: row.author_id, author });
  }
  const ledger = await query(
    "SELECT id,user_id,event_key FROM point_records WHERE (id LIKE 'seed-points-%' OR id LIKE 'demo-v2-point-%') AND event_key LIKE 'post:%'",
  );
  await mkdir(path.join(privateDir, 'backups'), { recursive: true });
  await writeFile(
    path.join(privateDir, 'backups', `community-authors-${Date.now()}.json`),
    JSON.stringify({ changes, ledger }, null, 2),
    { flag: 'wx' },
  );
  await transaction(async (c) => {
    for (const change of changes) {
      await query(
        'UPDATE posts SET author_id=? WHERE id=? AND author_id=?',
        [change.author, change.id, change.previous],
        c,
      );
      for (const record of ledger.filter((r) => r.event_key === `post:${change.id}`))
        await query(
          'UPDATE point_records SET user_id=? WHERE id=? AND user_id=?',
          [change.author, record.id, change.previous],
          c,
        );
    }
    await query(
      "UPDATE users u SET points=(SELECT COALESCE(SUM(p.amount),0) FROM point_records p WHERE p.user_id=u.id) WHERE u.id REGEXP '^u[0-9]+$'",
      [],
      c,
    );
    await query('INSERT INTO seed_runs(name) VALUES(?)', [marker], c);
  });
  const report = {
    marker,
    changedPosts: changes.length,
    categoryPosts: counters,
    pointLedgerReassigned: true,
    appliedAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(root, 'docs/community-author-distribution.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
}
