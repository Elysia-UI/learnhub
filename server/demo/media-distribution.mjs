import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { query, transaction } from '../db.mjs';
import { privateDir } from '../config.mjs';
import { posts } from './posts.mjs';
const marker = 'learnhub-community-media-variety-v2';
const palettes = {
  ai: ['ai-workbench', 'coding', 'analytics', 'desk', 'library', 'team', 'gaming', 'writing'],
  tech: ['coding', 'analytics', 'desk', 'team', 'library', 'ai-workbench', 'gaming', 'writing'],
  design: ['art', 'analytics', 'desk', 'writing', 'team', 'flowers', 'campus', 'coffee'],
  method: ['writing', 'library', 'desk', 'sunrise', 'coffee', 'lake', 'campus', 'forest'],
  career: ['team', 'desk', 'campus', 'writing', 'coffee', 'library', 'analytics', 'ai-workbench'],
  campus: ['campus', 'library', 'team', 'desk', 'coffee', 'forest', 'flowers', 'lake'],
};
export async function diversifyDemoMedia() {
  if ((await query('SELECT name FROM seed_runs WHERE name=?', [marker])).length) return;
  const catalog = new Map(posts.map((p, i) => [i < 100 ? p.id : `demo-v2-post-${i + 1}`, p]));
  const rows = await query(
    "SELECT id,title,content,image,category_id FROM posts WHERE id REGEXP '^p[0-9]+$' OR id LIKE 'demo-v2-post-%' ORDER BY pinned DESC,created_at DESC,id",
  );
  const counters = {},
    changes = [];
  for (const row of rows) {
    const p = catalog.get(row.id),
      palette = palettes[row.category_id];
    if (
      !p ||
      !palette ||
      row.title !== p.title ||
      row.content !== p.content ||
      !row.image?.startsWith('/images/community/')
    )
      continue;
    const slot = counters[p.category] || 0;
    counters[p.category] = slot + 1;
    const key = palette[slot % palette.length],
      image = `/images/community/${key}.${key === 'ai-workbench' ? 'png' : 'jpg'}`;
    if (row.image !== image) changes.push({ id: row.id, previous: row.image, image });
  }
  await mkdir(path.join(privateDir, 'backups'), { recursive: true });
  await writeFile(
    path.join(privateDir, 'backups', `community-media-${Date.now()}.json`),
    JSON.stringify(changes, null, 2),
    { flag: 'wx' },
  );
  await transaction(async (c) => {
    for (const change of changes)
      await query(
        'UPDATE posts SET image=? WHERE id=? AND image=?',
        [change.image, change.id, change.previous],
        c,
      );
    await query('INSERT INTO seed_runs(name) VALUES(?)', [marker], c);
  });
  console.log(JSON.stringify({ marker, changedPostImages: changes.length }));
}
