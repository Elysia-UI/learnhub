import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createSeed } from '../src/data/seed.ts';
import { query, transaction, pool } from './db.mjs';
import { privateRead, privateWrite, privateDir, privateFile, storageDir, root } from './config.mjs';
import { hashPassword, passwordSchema } from './security.mjs';
import { migrate } from './migrate.mjs';
import { enrichDemo } from './enrich-demo.mjs';
const marker = 'learnhub-rich-demo-v1';
const date = (value) => new Date(value);
const recent = (days, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 3600000);
async function bulk(conn, table, columns, rows) {
  for (let i = 0; i < rows.length; i += 100)
    await conn.query(`INSERT IGNORE INTO ${table} (${columns.join(',')}) VALUES ?`, [
      rows.slice(i, i + 100),
    ]);
}
export async function seed() {
  await migrate();
  if ((await query('SELECT name FROM seed_runs WHERE name=?', [marker])).length) {
    console.log('Seed already applied; existing accounts and content preserved.');
    await enrichDemo();
    return;
  }
  const base = createSeed(),
    userIds = [...Array.from({ length: 29 }, (_, i) => `u${i + 1}`), 'admin'];
  const accountPath = privateFile('demo-accounts.dpapi');
  const accounts = existsSync(accountPath)
    ? privateRead('demo-accounts.dpapi')
    : userIds.map((id, i) => ({
        id,
        email:
          id === 'admin'
            ? process.env.ADMIN_EMAIL || 'admin@learnhub.example.invalid'
            : `learner${String(i + 1).padStart(2, '0')}@learnhub.example.invalid`,
        password:
          id === 'admin' && process.env.ADMIN_PASSWORD
            ? passwordSchema.parse(process.env.ADMIN_PASSWORD)
            : `${randomBytes(18).toString('base64url')}7a!`,
        role:
          id === 'admin'
            ? 'admin'
            : ['u2', 'u3', 'u4', 'u6', 'u7'].includes(id)
              ? 'teacher'
              : 'student',
      }));
  if (!existsSync(accountPath)) privateWrite('demo-accounts.dpapi', accounts);
  const users = [];
  for (let i = 0; i < accounts.length; i++) {
    const a = accounts[i],
      old = base.users.find((u) => u.id === a.id);
    users.push([
      a.id,
      a.email,
      old?.name ||
        `${a.role === 'teacher' ? '知学讲师' : '知学同学'}${String(i + 1).padStart(2, '0')}`,
      await hashPassword(a.password),
      a.role,
      old?.avatar || `/images/avatar-${(i % 5) + 1}.jpg`,
      old?.bio || '这是用于毕业设计验收的虚拟学习账号，记录学习与实践。',
      recent(30 + i),
    ]);
  }
  const topics = [
    ['Vue 3 组件通信', 'tech'],
    ['TypeScript 类型收窄', 'tech'],
    ['REST API 接口设计', 'tech'],
    ['CSS 响应式布局', 'tech'],
    ['Git 团队协作', 'tech'],
    ['Figma 自动布局', 'design'],
    ['设计系统与变量', 'design'],
    ['可用性测试', 'design'],
    ['提示词与模型评估', 'ai'],
    ['检索增强生成', 'ai'],
    ['AI 应用的错误处理', 'ai'],
    ['实习项目复盘', 'career'],
    ['技术面试表达', 'career'],
    ['简历项目整理', 'career'],
    ['主动回忆学习法', 'method'],
    ['间隔重复与笔记', 'method'],
    ['每周学习计划', 'method'],
    ['考研阅读复盘', 'campus'],
    ['校园项目实践', 'campus'],
    ['摄影与阅读记录', 'life'],
  ];
  const postRows = [];
  for (let i = 0; i < 100; i++) {
    const old = base.posts[i],
      topic = topics[i % topics.length],
      round = Math.floor(i / topics.length) + 1;
    postRows.push([
      old?.id || `p${i + 1}`,
      old?.authorId || userIds[i % 29],
      old?.category || topic[1],
      old?.title || `${topic[0]}：第 ${round} 次实践与复盘`,
      old?.content ||
        `## ${topic[0]}\n\n这是第 ${round} 次项目实践记录。我的目标是把概念变成可以验证的结果，而不是只停留在阅读文档。\n\n### 本次遇到的问题\n\n在实现过程中，我先把需求拆成输入、处理和输出，写下预期表现，再检查每一步的实际结果。\n\n### 实践过程\n\n1. 明确一个可以在当天完成的小目标。\n2. 使用最小示例验证关键概念。\n3. 补充错误处理、边界输入与测试记录。\n4. 结合反馈整理下一次改进计划。\n\n### 我的收获\n\n${topic[0]}需要结合具体情境理解。保留问题与解决过程，比仅保存最终代码更有价值。欢迎分享你的不同思路。`,
      JSON.stringify(old?.tags || [topic[0], round % 2 ? '项目实践' : '学习复盘']),
      old?.type || (i % 3 ? '分享' : '讨论'),
      old?.image || (i % 4 === 0 ? '/images/code.jpg' : null),
      i % 23,
      Number(old?.featured || i % 11 === 0),
      Number(i === 0),
      date(old?.createdAt || recent(i % 30, 12 + (i % 12))),
    ]);
  }
  const comments = [];
  const commentsText = [
    '我也遇到过类似问题，先把目标缩小到一个可验证的例子，后续会清晰很多。',
    '感谢整理，我准备按这个思路实践一次，再回来分享遇到的问题。',
    '建议补充输入边界和失败情况，能更完整地检验自己的理解。',
    '这部分最好结合真实场景，明确为什么选择这种方法以及有哪些限制。',
    '我的做法是先独立尝试，再看参考方案，并记录两者之间的差异。',
    '学习过程里的复盘很重要。每周留一点时间回顾，会发现很多可以改进的细节。',
  ];
  for (let i = 0; i < 300; i++) {
    const pi = Math.floor(i / 3),
      id = `seed-comment-${i + 1}`,
      parent = i % 3 === 2 ? `seed-comment-${i}` : null;
    comments.push([
      id,
      postRows[pi][0],
      userIds[(i + 4) % 29],
      parent,
      commentsText[i % commentsText.length],
      new Date(date(postRows[pi][11]).getTime() + ((i % 3) + 1) * 60000),
    ]);
  }
  const courseRows = [],
    chapterRows = [];
  const teachers = ['u2', 'u3', 'u4', 'u6', 'u7'];
  for (let i = 0; i < 20; i++) {
    const old = base.courses[i],
      topic = topics[i],
      id = old?.id || `course-${i + 1}`;
    courseRows.push([
      id,
      old?.teacherId || teachers[i % 5],
      old?.category || topic[1],
      old?.title || `${topic[0]}实践课程`,
      old?.subtitle || '从理解概念到完成自己的作品',
      old?.description ||
        `围绕${topic[0]}建立完整的学习路径，通过概念、实例、练习和复盘四个阶段，把知识运用到真实任务。`,
      old?.image || '',
      old?.visual || 'spring',
      old?.badge || '实战',
      old?.rating || 0,
      old?.hours || 8 + (i % 12),
      old?.level || (i % 2 ? '进阶' : '入门'),
      JSON.stringify(old?.tags || [topic[0], '实践课程']),
      date(old?.createdAt || recent(i + 2)),
    ]);
    for (let j = 0; j < 4; j++) {
      const c = old?.chapters[j];
      chapterRows.push([
        c?.id || `chapter-${i + 1}-${j + 1}`,
        id,
        c?.title || ['建立基础理解', '拆解实际案例', '完成独立练习', '复盘与改进'][j],
        c?.content ||
          `## ${topic[0]}：${['基础理解', '案例拆解', '实践练习', '复盘改进'][j]}\n\n这一节围绕一个明确目标展开。先描述问题，再理解相关概念，最后通过自己的练习验证结果。\n\n### 任务\n\n- 用自己的语言总结关键概念。\n- 找到一个与课程主题相关的具体场景。\n- 记录输入、执行步骤与预期结果。\n- 检查至少两类边界或失败情况。\n\n### 实践建议\n\n选择足够小的任务，让一次学习能得到明确反馈。遇到问题时保留尝试记录，并在社区提问。\n\n> 本节完成标准：能够解释方法的适用条件，并给出一个经过验证的例子。`,
        c?.duration || `${15 + j * 5} 分钟`,
        j,
      ]);
    }
  }
  const questionRows = [],
    answerRows = [];
  for (let i = 0; i < 30; i++) {
    const old = base.questions[i],
      topic = topics[i % 20],
      id = old?.id || `q${i + 1}`;
    questionRows.push([
      id,
      old?.authorId || userIds[(i + 2) % 29],
      old?.category || topic[1],
      old?.title || `学习${topic[0]}时，如何验证自己真正掌握了？（场景 ${Math.floor(i / 20) + 1}）`,
      old?.content ||
        `我正在学习${topic[0]}，看教程时能够理解，但独立完成任务时容易卡住。已经尝试整理笔记和跟做案例，想知道如何安排练习、检查结果，以及怎样有效地复盘。`,
      JSON.stringify(old?.tags || [topic[0], '学习求助']),
      i % 19,
      i % 3 === 0 ? 10 : 0,
      date(old?.createdAt || recent(i % 20, 4)),
    ]);
    for (let j = 0; j < 2; j++) {
      const author = userIds[(i + j + 8) % 29];
      answerRows.push([
        `seed-answer-${i + 1}-${j + 1}`,
        id,
        author,
        j === 0
          ? `建议先为${topic[0]}设定一个可验收的小任务，再独立完成。把预期结果写下来，遇到困难时记录具体输入和错误现象，最后对照文档逐步排查。`
          : `可以使用主动回忆和项目复盘：关闭教程后解释关键步骤，再找一个不同场景重新应用。解释不清楚的地方，就是下一次练习的重点。`,
        new Date(date(questionRows[i][8]).getTime() + (j + 1) * 60000),
      ]);
    }
  }
  const resourceRows = [];
  for (let i = 0; i < 50; i++) {
    const old = base.resources[i],
      topic = topics[i % 20],
      csv = old?.type === 'CSV' || (i >= 5 && (i + 1) % 5 === 0),
      ext = csv ? 'csv' : 'md',
      id = old?.id || `r${i + 1}`,
      key = `seed-${id}.${ext}`;
    let body = old
      ? await readFile(
          path.join(root, old.url.replace(/^\//, '').replace(/^resources\//, 'public/resources/')),
          'utf8',
        ).catch(() => null)
      : null;
    if (!body)
      body = csv
        ? `阶段,学习目标,实践任务,完成情况,复盘\n基础,理解${topic[0]},整理三个关键概念,未开始,\n案例,分析输入与输出,复现一个最小示例,未开始,\n实践,独立完成任务,补充失败和边界情况,未开始,\n复盘,改进学习方法,写下一次行动计划,未开始,\n`
        : `# ${topic[0]}学习手册 ${Math.floor(i / 20) + 1}\n\nLearnHub 知学社区 · 虚拟演示资料\n\n## 学习目标\n\n理解${topic[0]}的基本原理，建立可执行、可验证的练习过程。\n\n## 知识整理清单\n\n1. 用一句话说明这一知识点解决什么问题。\n2. 列出输入、输出和适用条件。\n3. 通过一个最小示例验证自己的理解。\n4. 比较两种方案的成本与限制。\n\n## 实践记录模板\n\n- 任务背景：\n- 预期结果：\n- 实际现象：\n- 尝试过的方法：\n- 验证结果：\n- 下一步改进：\n\n## 自测问题\n\n- 你能在不看资料时解释核心步骤吗？\n- 如果输入发生变化，方案是否仍然适用？\n- 出错时应该收集哪些证据？\n\n本资料为项目验收创建的学习提纲，不替代正式教材。\n`;
    const file = path.join(storageDir, key);
    if (!existsSync(file)) await writeFile(file, body, { flag: 'wx' });
    const bytes = (await stat(file)).size;
    resourceRows.push([
      id,
      old?.authorId || teachers[i % 5],
      old?.category || topic[1],
      old?.title || `${topic[0]}${csv ? '计划模板' : '学习手册'} ${Math.floor(i / 20) + 1}`,
      old?.description ||
        `围绕${topic[0]}整理的学习目标、实践步骤、复盘清单和自测问题，包含可以实际下载使用的 ${ext.toUpperCase()} 文件。`,
      ext.toUpperCase(),
      bytes,
      old?.filename || `${topic[0]}-${i + 1}.${ext}`,
      key,
      csv ? 'text/csv' : 'text/markdown',
      JSON.stringify(old?.tags || [topic[0], csv ? '模板素材' : '学习笔记']),
      recent(i % 25),
    ]);
  }
  await transaction(async (c) => {
    await bulk(
      c,
      'roles',
      ['code', 'name'],
      [
        ['student', '学生'],
        ['teacher', '教师'],
        ['admin', '管理员'],
      ],
    );
    await bulk(c, 'point_rules', ['code', 'amount'], Object.entries(base.pointRules));
    await bulk(
      c,
      'users',
      ['id', 'email', 'name', 'password_hash', 'role', 'avatar', 'bio', 'created_at'],
      users,
    );
    await bulk(
      c,
      'categories',
      ['id', 'name', 'icon', 'color', 'description'],
      base.categories.map((x) => [x.id, x.name, x.icon, x.color, x.description]),
    );
    await bulk(
      c,
      'posts',
      [
        'id',
        'author_id',
        'category_id',
        'title',
        'content',
        'tags',
        'type',
        'image',
        'views',
        'featured',
        'pinned',
        'created_at',
      ],
      postRows,
    );
    // Insert root comments before replies so the self-referencing foreign key is always satisfied.
    await bulk(
      c,
      'post_comments',
      ['id', 'post_id', 'author_id', 'parent_id', 'content', 'created_at'],
      comments.filter((x) => !x[3]),
    );
    await bulk(
      c,
      'post_comments',
      ['id', 'post_id', 'author_id', 'parent_id', 'content', 'created_at'],
      comments.filter((x) => x[3]),
    );
    const likes = [],
      favorites = [];
    for (let i = 0; i < 100; i++) {
      for (let j = 0; j < 4; j++) likes.push([postRows[i][0], userIds[(i + j + 2) % 29]]);
      for (let j = 0; j < 2; j++) favorites.push([postRows[i][0], userIds[(i + j + 5) % 29]]);
    }
    await bulk(c, 'post_likes', ['post_id', 'user_id'], likes);
    await bulk(c, 'post_favorites', ['post_id', 'user_id'], favorites);
    await bulk(
      c,
      'courses',
      [
        'id',
        'teacher_id',
        'category_id',
        'title',
        'subtitle',
        'description',
        'image',
        'visual',
        'badge',
        'rating',
        'hours',
        'level',
        'tags',
        'created_at',
      ],
      courseRows,
    );
    await query(
      "UPDATE courses SET featured=1 WHERE id IN ('course-ai','course-figma','course-spring','course-study')",
      [],
      c,
    );
    await bulk(
      c,
      'course_chapters',
      ['id', 'course_id', 'title', 'content', 'duration', 'position'],
      chapterRows,
    );
    const enroll = [],
      progress = [];
    for (let i = 0; i < 20; i++)
      for (let j = 0; j < 3; j++) {
        const userId = userIds[(i + j) % 29],
          chapter = chapterRows.filter((ch) => ch[1] === courseRows[i][0]);
        enroll.push([userId, courseRows[i][0], chapter[1][0], recent(j)]);
        for (let k = 0; k < j + 1; k++)
          progress.push([userId, courseRows[i][0], chapter[k][0], recent(j)]);
      }
    await bulk(
      c,
      'course_enrollments',
      ['user_id', 'course_id', 'last_chapter_id', 'updated_at'],
      enroll,
    );
    await bulk(
      c,
      'learning_progress',
      ['user_id', 'course_id', 'chapter_id', 'completed_at'],
      progress,
    );
    await bulk(
      c,
      'questions',
      [
        'id',
        'author_id',
        'category_id',
        'title',
        'content',
        'tags',
        'views',
        'bounty',
        'created_at',
      ],
      questionRows,
    );
    await bulk(
      c,
      'answers',
      ['id', 'question_id', 'author_id', 'content', 'created_at'],
      answerRows,
    );
    for (let i = 0; i < 30; i += 3)
      await query(
        'UPDATE questions SET accepted_answer_id=? WHERE id=?',
        [`seed-answer-${i + 1}-1`, questionRows[i][0]],
        c,
      );
    await bulk(
      c,
      'question_favorites',
      ['question_id', 'user_id'],
      questionRows.map((q, i) => [q[0], userIds[(i + 1) % 29]]),
    );
    await bulk(
      c,
      'answer_likes',
      ['answer_id', 'user_id'],
      answerRows.map((a, i) => [a[0], userIds[(i + 2) % 29]]),
    );
    await bulk(
      c,
      'resources',
      [
        'id',
        'author_id',
        'category_id',
        'title',
        'description',
        'type',
        'byte_size',
        'filename',
        'storage_key',
        'mime',
        'tags',
        'created_at',
      ],
      resourceRows,
    );
    await query("UPDATE resources SET status='approved' WHERE id REGEXP '^r[0-9]+$'", [], c);
    await bulk(
      c,
      'resource_favorites',
      ['resource_id', 'user_id'],
      resourceRows.map((r, i) => [r[0], userIds[(i + 7) % 29]]),
    );
    await bulk(
      c,
      'announcements',
      ['id', 'title', 'content', 'type', 'pinned', 'created_at'],
      base.notices.map((n) => [
        n.id,
        n.title,
        n.content.replace(
          '当前预览阶段的操作保存在本机浏览器，后续接入服务器后再提供跨设备同步。',
          '课程进度通过后端保存在云数据库中，登录后可以恢复。',
        ),
        n.type,
        Number(n.pinned),
        date(n.createdAt),
      ]),
    );
    const checkins = [],
      records = [];
    let ri = 0;
    const record = (user, key, reason, amount, when) =>
      records.push([`seed-points-${++ri}`, user, key, reason, amount, when]);
    for (let i = 0; i < 29; i++)
      for (let j = 1; j <= 3; j++) {
        const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(
          recent(j),
        );
        checkins.push([userIds[i], day]);
        record(userIds[i], `checkin:${day}`, '每日签到', 2, recent(j));
      }
    for (const p of postRows) record(p[1], `post:${p[0]}`, '发布帖子', 5, p[11]);
    for (const a of answerRows) record(a[2], `answer:${a[0]}`, '回答问题', 3, a[4]);
    for (let i = 0; i < 30; i += 3)
      record(
        answerRows[i * 2][2],
        `accepted:${questionRows[i][0]}`,
        '回答被采纳',
        10,
        recent(i % 20),
      );
    for (const r of resourceRows) record(r[1], `resource:${r[0]}`, '分享资源通过审核', 5, r[12]);
    await bulk(c, 'checkins', ['user_id', 'day'], checkins);
    await bulk(
      c,
      'point_records',
      ['id', 'user_id', 'event_key', 'reason', 'amount', 'created_at'],
      records,
    );
    await query(
      'UPDATE users u SET points=(SELECT COALESCE(SUM(p.amount),0) FROM point_records p WHERE p.user_id=u.id)',
      [],
      c,
    );
    await bulk(
      c,
      'notifications',
      ['id', 'user_id', 'title', 'content', 'type', 'link'],
      userIds.map((id) => [
        `seed-welcome-${id}`,
        id,
        '欢迎加入知学社区',
        '这里的内容来自云数据库。欢迎分享学习实践，与伙伴一起成长。',
        'system',
        '/forum',
      ]),
    );
    await query('INSERT INTO seed_runs(name) VALUES(?)', [marker], c);
  });
  console.log(
    JSON.stringify({
      seed: marker,
      users: 30,
      posts: 100,
      comments: 300,
      courses: 20,
      chapters: 80,
      resources: 50,
      questions: 30,
      credentials: 'Windows DPAPI: .local/demo-accounts.dpapi',
    }),
  );
  await enrichDemo();
}
if (process.argv[1]?.endsWith('seed.mjs')) {
  try {
    await seed();
  } finally {
    await pool.end();
  }
}
