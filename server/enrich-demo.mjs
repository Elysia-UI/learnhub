import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createSeed } from '../src/data/seed.ts';
import { query, transaction, pool, json } from './db.mjs';
import { privateDir, root, storageDir } from './config.mjs';
import { profiles } from './demo/profiles.mjs';
import { posts } from './demo/posts.mjs';
import { courses } from './demo/courses.mjs';
import { questions } from './demo/questions.mjs';
import { resources } from './demo/resources.mjs';
import { diversifyDemoAuthors } from './demo/author-distribution.mjs';
import { diversifyDemoMedia } from './demo/media-distribution.mjs';

const marker = 'learnhub-community-variety-v2';
const base = createSeed();
const oldTopics = [
  'Vue 3 组件通信',
  'TypeScript 类型收窄',
  'REST API 接口设计',
  'CSS 响应式布局',
  'Git 团队协作',
  'Figma 自动布局',
  '设计系统与变量',
  '可用性测试',
  '提示词与模型评估',
  '检索增强生成',
  'AI 应用的错误处理',
  '实习项目复盘',
  '技术面试表达',
  '简历项目整理',
  '主动回忆学习法',
  '间隔重复与笔记',
  '每周学习计划',
  '考研阅读复盘',
  '校园项目实践',
  '摄影与阅读记录',
];
const oldComments = new Set([
  '我也遇到过类似问题，先把目标缩小到一个可验证的例子，后续会清晰很多。',
  '感谢整理，我准备按这个思路实践一次，再回来分享遇到的问题。',
  '建议补充输入边界和失败情况，能更完整地检验自己的理解。',
  '这部分最好结合真实场景，明确为什么选择这种方法以及有哪些限制。',
  '我的做法是先独立尝试，再看参考方案，并记录两者之间的差异。',
  '学习过程里的复盘很重要。每周留一点时间回顾，会发现很多可以改进的细节。',
]);
const extraReplies = {
  p1: [
    '我把这一周的三次练习截图放在同一个文件夹里，周末看得见成果，就没那么想临时换路线了。',
    '今天临时加班，只翻了昨天留下的问题。没有再把落下的内容全挤到睡前，先试着这样继续。',
  ],
  p2: ['建议还给日期样例加一个空输入，这样就不会只验证正常日期了。'],
  p3: [
    '我补了一次离开页面再返回的测试，果然还能遇到旧结果闪回，感谢楼上提醒。',
    '如果把关键词、分类和页码写进地址，别人也更容易复现你看到的结果。',
  ],
  p4: ['我试了灰度版，标题和按钮的层级问题一下就看出来了，已经把这个步骤加到走查里。'],
  p7: ['把失败响应也建成独立类型之后，提交按钮不用在五个地方重复判空了。'],
  p9: [
    '过期资料可以先单独放一个集合，不然初期排查时不容易区分是检索错了还是生成错了。',
    '我会在评测记录里留下实际取出的片段，这样换配置后还能对照是不是拿到了同样材料。',
  ],
  p10: ['评审说明里贴上错误状态的截图很加分，说明这条路径真的被走过。'],
  p11: ['不同语言下的按钮长度也可以试试，中文看着正好的宽度，换英文很容易不够。'],
  p12: ['集成负责人不是替别人收尾，而是确保大家的东西能按约定拼到一起，这点要提前说清。'],
  p14: ['文件名那段给我提了醒，我的数据全是短标题，难怪一直没发现。'],
  p15: ['我还会给不确定的字段留空值处理，不让模型为了符合格式硬编一项。'],
  p16: ['在变式题旁边写一句为什么旧思路会失败，下次翻到这里更容易想起来。'],
  p17: ['把熟悉改成实际做过的动作之后，简历变短了，但终于能自己读顺。'],
  p20: ['我们彩排时发现一条主流程要点十几次，后来删掉了三个没必要展示的支线。'],
  p22: ['如果要重试，也记得区分这一次请求和用户后来新发起的操作，别把重试结果放错位置。'],
  p25: ['把请求失败和筛选无结果分开后，页面文案终于不用一句暂无内容包打天下。'],
  p28: ['解决冲突以后还检查一下测试文件，有时候代码合上了，原来的预期却没同步。'],
  p34: ['第一次失败作品拍下来真的有用，第二次做得一般也能看见哪里变了。'],
  p35: ['组件离开时记得取消观察，我之前来回切页面后重复触发过好几次加载。'],
  p39: ['问题没有写清楚时，就算原型再精致也很难评审。先把用户手里的信息列出来，往往能找到原因。'],
  p45: ['时间字段别只看页面显示，可以临时输出带时区的规范格式核对，查完再撤掉调试日志。'],
  p49: ['危险动作按钮上的文案具体之后，误点前真的会多看一眼。'],
  p54: ['初始化脚本重复跑也要检查，不能为了方便演示把真实业务数据清掉。'],
};
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const protectedSnapshot = async () => ({
  users: await query(
    "SELECT id,email,name,avatar,bio,role,status,points FROM users WHERE id NOT REGEXP '^u[0-9]+$' ORDER BY id",
  ),
  posts: await query(
    "SELECT id,author_id,title,content,category_id,tags,image FROM posts WHERE id NOT REGEXP '^p[0-9]+$' AND id NOT LIKE 'demo-v2-post-%' ORDER BY id",
  ),
  comments: await query(
    "SELECT id,post_id,author_id,content,parent_id FROM post_comments WHERE id NOT LIKE 'seed-comment-%' AND id NOT LIKE 'demo-v2-comment-%' ORDER BY id",
  ),
});

// All names below are code-owned table/column lists, values are parameterized.
async function updateRows(c, table, rows, columns) {
  for (let offset = 0; offset < rows.length; offset += 30) {
    const chunk = rows.slice(offset, offset + 30),
      args = [];
    const sets = columns.map((column) => {
      const cases = chunk
        .map((row) => {
          args.push(row.id, row[column] ?? null);
          return 'WHEN ? THEN ?';
        })
        .join(' ');
      return `${column}=CASE id ${cases} ELSE ${column} END`;
    });
    args.push(...chunk.map((row) => row.id));
    await query(
      `UPDATE ${table} SET ${sets.join(',')} WHERE id IN (${chunk.map(() => '?').join(',')})`,
      args,
      c,
    );
  }
}

export async function enrichDemo({ dryRun = false } = {}) {
  if ((await query('SELECT name FROM seed_runs WHERE name=?', [marker])).length) {
    await diversifyDemoAuthors();
    await diversifyDemoMedia();
    console.log('Curated community data already applied; existing edits preserved.');
    return { alreadyApplied: true };
  }
  const [
    allUsers,
    allPosts,
    allComments,
    allCourses,
    allChapters,
    allQuestions,
    allAnswers,
    allResources,
  ] = await Promise.all([
    query('SELECT id,email,name,avatar,bio FROM users'),
    query('SELECT id,author_id,title,content,type,category_id,tags,image,created_at FROM posts'),
    query('SELECT id,post_id,content FROM post_comments'),
    query(
      'SELECT id,title,subtitle,description,image,visual,category_id,tags,hours,level FROM courses',
    ),
    query(
      'SELECT id,course_id,title,content,duration,position FROM course_chapters ORDER BY course_id,position',
    ),
    query('SELECT id,title,content,category_id,tags FROM questions'),
    query('SELECT id,content FROM answers'),
    query(
      'SELECT id,title,description,storage_key,filename,type,byte_size,mime,category_id,tags FROM resources',
    ),
  ]);
  const users = [];
  for (const p of profiles) {
    const current = allUsers.find((u) => u.id === p.id),
      index = Number(p.id.slice(1)) - 1,
      old = base.users.find((u) => u.id === p.id);
    const oldName =
      old?.name ||
      `${['u6', 'u7'].includes(p.id) ? '知学讲师' : '知学同学'}${String(index + 1).padStart(2, '0')}`;
    const oldBio = old?.bio || '这是用于毕业设计验收的虚拟学习账号，记录学习与实践。';
    if (
      current?.email === `learner${String(index + 1).padStart(2, '0')}@learnhub.example.invalid` &&
      current.name === oldName &&
      current.bio === oldBio &&
      /^\/images\/avatar-\d+\.jpg$/.test(current.avatar)
    )
      users.push(p);
  }
  const postUpdates = [],
    newPosts = [];
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i],
      current = allPosts.find((x) => x.id === p.id),
      old = base.posts.find((x) => x.id === p.id);
    const expectedTitle =
      old?.title || `${oldTopics[i % 20]}：第 ${Math.floor(i / 20) + 1} 次实践与复盘`;
    if (
      i < 100 &&
      current &&
      current.title === expectedTitle &&
      (old
        ? current.content === old.content
        : current.content.includes('我的目标是把概念变成可以验证的结果，而不是只停留在阅读文档。'))
    ) {
      const expectedTags = old?.tags || [
        oldTopics[i % 20],
        Math.floor(i / 20) % 2 === 0 ? '项目实践' : '学习复盘',
      ];
      if (JSON.stringify(json(current.tags)) === JSON.stringify(expectedTags))
        postUpdates.push({
          ...p,
          category_id: p.category,
          tags: JSON.stringify(p.tags),
          image: i % 4 === 3 ? null : p.image,
        });
    } else if (i >= 100) {
      newPosts.push({
        ...p,
        id: `demo-v2-post-${i + 1}`,
        author_id: `u${((i * 7) % 29) + 1}`,
        created_at: new Date(Date.now() - ((i % 9) + 1) * 86400000 - (i % 7) * 3600000),
      });
    }
  }
  const selectedPosts = new Map(postUpdates.map((p) => [p.id, p]));
  const comments = allComments.flatMap((c) => {
    const p = selectedPosts.get(c.post_id),
      match = c.id.match(/^seed-comment-(\d+)$/);
    return p && match && oldComments.has(c.content)
      ? [{ id: c.id, content: p.replies[(Number(match[1]) - 1) % 3] }]
      : [];
  });
  const courseUpdates = [],
    chapters = [];
  for (let i = 0; i < courses.length; i++) {
    const value = courses[i],
      current = allCourses.find((c) => c.id === value.id),
      old = base.courses.find((c) => c.id === value.id);
    if (
      !current ||
      current.title !== (old?.title || `${oldTopics[i]}实践课程`) ||
      current.description !==
        (old?.description ||
          `围绕${oldTopics[i]}建立完整的学习路径，通过概念、实例、练习和复盘四个阶段，把知识运用到真实任务。`)
    )
      continue;
    courseUpdates.push({ ...value, category_id: value.category, tags: JSON.stringify(value.tags) });
    const existing = allChapters.filter((c) => c.course_id === value.id);
    for (let j = 0; j < existing.length && j < 4; j++) {
      const ch = existing[j],
        oldChapter = old?.chapters.find((c) => c.id === ch.id);
      if (
        (oldChapter && ch.content === oldChapter.content) ||
        (!oldChapter && ch.content.includes('这一节围绕一个明确目标展开。先描述问题'))
      )
        chapters.push({ id: ch.id, ...value.chapters[j] });
    }
  }
  const questionUpdates = [],
    answers = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i],
      current = allQuestions.find((x) => x.id === q.id),
      old = base.questions.find((x) => x.id === q.id);
    const expectedTitle =
      old?.title ||
      `学习${oldTopics[i % 20]}时，如何验证自己真正掌握了？（场景 ${Math.floor(i / 20) + 1}）`;
    if (
      !current ||
      current.title !== expectedTitle ||
      (old
        ? current.content !== old.content
        : !current.content.includes('看教程时能够理解，但独立完成任务时容易卡住。'))
    )
      continue;
    questionUpdates.push({ ...q, category_id: q.category, tags: JSON.stringify(q.tags) });
    for (let j = 0; j < 2; j++) {
      const id = `seed-answer-${i + 1}-${j + 1}`,
        a = allAnswers.find((a) => a.id === id);
      if (
        a &&
        (a.content.startsWith('建议先为') || a.content.startsWith('可以使用主动回忆和项目复盘：'))
      )
        answers.push({ id, content: q.answers[j] });
    }
  }
  const resourceUpdates = [];
  for (let i = 0; i < resources.length; i++) {
    const r = resources[i],
      current = allResources.find((x) => x.id === r.id),
      old = base.resources.find((x) => x.id === r.id);
    if (
      !current ||
      (old ? current.title !== old.title : !current.description.includes('包含可以实际下载使用的'))
    )
      continue;
    resourceUpdates.push({
      ...r,
      category_id: r.category,
      tags: JSON.stringify(r.tags),
      type: r.ext.toUpperCase(),
      byte_size: Buffer.byteLength(r.body),
      filename: `${r.title}.${r.ext}`,
      storage_key: `demo-variety-v2-${r.id}.${r.ext}`,
      mime: r.ext === 'csv' ? 'text/csv' : 'text/markdown',
    });
  }
  const report = {
    marker,
    profiles: users.length,
    posts: postUpdates.length,
    newPosts: newPosts.length,
    comments: comments.length,
    courses: courseUpdates.length,
    chapters: chapters.length,
    questions: questionUpdates.length,
    answers: answers.length,
    resources: resourceUpdates.length,
    skippedEditedDemoPosts: 100 - postUpdates.length,
  };
  if (dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }
  // Files are immutable versioned assets. Old files remain for recovery.
  for (const r of resourceUpdates) {
    const file = path.join(storageDir, r.storage_key);
    try {
      await writeFile(file, r.body, { flag: 'wx' });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if ((await readFile(file, 'utf8')) !== r.body)
        throw new Error('Existing versioned demo file differs; refusing overwrite');
    }
  }
  await mkdir(path.join(privateDir, 'backups'), { recursive: true });
  const beforeProtected = await protectedSnapshot(),
    beforeHash = sha(beforeProtected);
  const backup = {
    createdAt: new Date().toISOString(),
    users: allUsers.filter((u) => users.some((x) => x.id === u.id)),
    posts: allPosts.filter((p) => selectedPosts.has(p.id)),
    comments: allComments.filter((c) => comments.some((x) => x.id === c.id)),
    courses: allCourses.filter((c) => courseUpdates.some((x) => x.id === c.id)),
    chapters: allChapters.filter((c) => chapters.some((x) => x.id === c.id)),
    questions: allQuestions.filter((q) => questionUpdates.some((x) => x.id === q.id)),
    answers: allAnswers.filter((a) => answers.some((x) => x.id === a.id)),
    resources: allResources.filter((r) => resourceUpdates.some((x) => x.id === r.id)),
    protectedDataHash: beforeHash,
  };
  await writeFile(
    path.join(privateDir, 'backups', `community-v2-${Date.now()}.json`),
    JSON.stringify(backup, null, 2),
    { flag: 'wx' },
  );
  await transaction(async (c) => {
    await updateRows(c, 'users', users, ['name', 'avatar', 'bio']);
    await updateRows(c, 'posts', postUpdates, [
      'title',
      'content',
      'category_id',
      'tags',
      'type',
      'image',
    ]);
    await updateRows(c, 'post_comments', comments, ['content']);
    for (const p of newPosts) {
      await query(
        'INSERT INTO posts(id,author_id,category_id,title,content,tags,type,image,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        [
          p.id,
          p.author_id,
          p.category,
          p.title,
          p.content,
          JSON.stringify(p.tags),
          p.type,
          p.image,
          p.created_at,
        ],
        c,
      );
      const event = `post:${p.id}`;
      await query(
        'INSERT INTO point_records(id,user_id,event_key,reason,amount,created_at) VALUES(?,?,?,?,5,?)',
        [`demo-v2-point-${p.id}`, p.author_id, event, '发布演示社区帖子', p.created_at],
        c,
      );
      await query('UPDATE users SET points=points+5 WHERE id=?', [p.author_id], c);
    }
    const replyGroups = [
      ...postUpdates
        .filter((p) => extraReplies[p.id])
        .map((p) => ({ post: p, replies: extraReplies[p.id], fresh: false })),
      ...newPosts.map((p) => ({ post: p, replies: p.replies, fresh: true })),
    ];
    let newComments = 0;
    for (const group of replyGroups) {
      const source = allPosts.find((p) => p.id === group.post.id),
        createdAt = source?.created_at || group.post.created_at;
      for (let j = 0; j < group.replies.length; j++) {
        const id = `demo-v2-comment-${group.post.id}-${j + 1}`,
          author = `u${((newComments * 11 + 8) % 29) + 1}`;
        await query(
          'INSERT INTO post_comments(id,post_id,author_id,content,created_at) VALUES(?,?,?,?,?)',
          [
            id,
            group.post.id,
            author,
            group.replies[j],
            new Date(
              Math.min(Date.now() - 60000, new Date(createdAt).getTime() + (j + 7) * 3600000),
            ),
          ],
          c,
        );
        newComments++;
      }
    }
    report.addedComments = newComments;
    await updateRows(c, 'courses', courseUpdates, [
      'title',
      'subtitle',
      'description',
      'image',
      'visual',
      'category_id',
      'tags',
      'hours',
      'level',
    ]);
    await updateRows(c, 'course_chapters', chapters, ['title', 'content', 'duration']);
    await updateRows(c, 'questions', questionUpdates, ['title', 'content', 'category_id', 'tags']);
    await updateRows(c, 'answers', answers, ['content']);
    await updateRows(c, 'resources', resourceUpdates, [
      'title',
      'description',
      'category_id',
      'type',
      'byte_size',
      'filename',
      'storage_key',
      'mime',
      'tags',
    ]);
    await query('INSERT INTO seed_runs(name) VALUES(?)', [marker], c);
  });
  const afterProtected = await protectedSnapshot();
  report.protectedDataPreserved = sha(afterProtected) === beforeHash;
  if (!report.protectedDataPreserved)
    throw new Error('Protected record verification failed; inspect backup before proceeding');
  report.appliedAt = new Date().toISOString();
  await diversifyDemoAuthors();
  await diversifyDemoMedia();
  await writeFile(
    path.join(root, 'docs/community-data-verification.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await enrichDemo({ dryRun: process.argv.includes('--dry-run') });
  } finally {
    await pool.end();
  }
}
