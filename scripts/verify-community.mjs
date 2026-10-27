import { writeFile, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { query, pool } from '../server/db.mjs';
import { root, storageDir } from '../server/config.mjs';
import { profiles } from '../server/demo/profiles.mjs';
import { posts } from '../server/demo/posts.mjs';
import { courses } from '../server/demo/courses.mjs';
import { questions } from '../server/demo/questions.mjs';
import { resources } from '../server/demo/resources.mjs';
try {
  const users = await query(
    "SELECT id,name,avatar,bio FROM users WHERE id REGEXP '^u[0-9]+$' ORDER BY id",
  );
  const forum = await query(
    "SELECT id,title,content,image FROM posts WHERE id REGEXP '^p[0-9]+$' OR id LIKE 'demo-v2-post-%'",
  );
  const comments = await query(
    "SELECT content FROM post_comments WHERE id LIKE 'seed-comment-%' OR id LIKE 'demo-v2-comment-%'",
  );
  const firstPages = await query(
    "WITH ranked AS (SELECT category_id,author_id,ROW_NUMBER() OVER(PARTITION BY category_id ORDER BY pinned DESC,created_at DESC,id) AS row_num FROM posts WHERE id REGEXP '^p[0-9]+$' OR id LIKE 'demo-v2-post-%') SELECT category_id,COUNT(*) AS items,COUNT(DISTINCT author_id) AS distinctAuthors FROM ranked WHERE row_num<=8 GROUP BY category_id",
  );
  const avatarHashes = await Promise.all(
    users.map(async (u) =>
      createHash('sha256')
        .update(await readFile(path.join(root, 'public', u.avatar)))
        .digest('hex'),
    ),
  );
  const chapters = await query('SELECT content FROM course_chapters');
  const files = await query(
    "SELECT storage_key,byte_size FROM resources WHERE id REGEXP '^r[0-9]+$'",
  );
  const assets = new Set(
    [
      ...users.map((u) => u.avatar),
      ...forum.map((p) => p.image),
      ...courses.map((c) => c.image),
    ].filter(Boolean),
  );
  const missingAssets = [];
  for (const asset of assets) {
    if (!asset.startsWith('/images/')) {
      missingAssets.push(asset);
      continue;
    }
    try {
      if ((await stat(path.join(root, 'public', asset))).size === 0) missingAssets.push(asset);
    } catch {
      missingAssets.push(asset);
    }
  }
  let validFiles = 0;
  const bodies = [];
  for (const file of files) {
    const bytes = await readFile(path.join(storageDir, file.storage_key));
    if (bytes.length === file.byte_size && bytes.length > 0) validFiles++;
    bodies.push(bytes.toString('utf8'));
  }
  const unique = (items) => new Set(items).size;
  const report = {
    checkedAt: new Date().toISOString(),
    catalog: {
      profiles: profiles.length,
      posts: posts.length,
      courses: courses.length,
      questions: questions.length,
      resources: resources.length,
    },
    database: {
      profiles: users.length,
      uniqueNames: unique(users.map((u) => u.name)),
      uniqueAvatars: unique(users.map((u) => u.avatar)),
      uniqueAvatarFiles: unique(avatarHashes),
      firstPages,
      posts: forum.length,
      uniquePostTitles: unique(forum.map((p) => p.title)),
      uniquePostBodies: unique(forum.map((p) => p.content)),
      oldTemplatePosts: forum.filter(
        (p) =>
          p.title.includes('次实践与复盘') ||
          p.content.includes('我的目标是把概念变成可以验证的结果，而不是只停留在阅读文档。'),
      ).length,
      comments: comments.length,
      uniqueComments: unique(comments.map((c) => c.content)),
      chapters: chapters.length,
      uniqueChapterBodies: unique(chapters.map((c) => c.content)),
      uniquePostImages: unique(forum.map((p) => p.image).filter(Boolean)),
      resourceFiles: files.length,
      validFiles,
      uniqueResourceBodies: unique(bodies),
      missingAssets,
    },
  };
  report.passed =
    users.length === 29 &&
    report.database.uniqueNames === 29 &&
    report.database.uniqueAvatars === 29 &&
    report.database.uniqueAvatarFiles === 29 &&
    firstPages.every((page) => page.items === page.distinctAuthors) &&
    forum.length === 112 &&
    report.database.uniquePostTitles === 112 &&
    report.database.uniquePostBodies === 112 &&
    report.database.oldTemplatePosts === 0 &&
    report.database.uniqueComments === comments.length &&
    report.database.uniqueChapterBodies >= 80 &&
    validFiles === 50 &&
    report.database.uniqueResourceBodies === 50 &&
    missingAssets.length === 0;
  await writeFile(
    path.join(root, 'docs/community-quality.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await pool.end();
}
