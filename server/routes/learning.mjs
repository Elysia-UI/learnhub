import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db.mjs';
import { auth, role, owner, validate, tagsSchema, idSchema, uid, assert } from '../security.mjs';
import { award, notify, audit } from '../services/activity.mjs';
export const learningRoutes = Router();
const questionSchema = z
  .object({
    title: z.string().trim().min(6).max(100),
    content: z.string().trim().min(10).max(30000),
    category: idSchema,
    tags: tagsSchema,
  })
  .strict();
async function categoryExists(id) {
  assert((await query('SELECT id FROM categories WHERE id=?', [id])).length, 400, '分类不存在');
}
learningRoutes.post('/questions', auth, async (req, res) => {
  const v = validate(questionSchema, req.body);
  await categoryExists(v.category);
  const id = uid('question');
  await query(
    'INSERT INTO questions(id,author_id,category_id,title,content,tags) VALUES(?,?,?,?,?,?)',
    [id, req.user.id, v.category, v.title, v.content, JSON.stringify(v.tags)],
  );
  res.status(201).json({ data: { id } });
});
learningRoutes.patch('/questions/:id', auth, async (req, res) => {
  const v = validate(questionSchema, req.body),
    [q] = await query('SELECT * FROM questions WHERE id=?', [req.params.id]);
  assert(q, 404, '问题不存在');
  owner(req, q.author_id);
  await categoryExists(v.category);
  await query('UPDATE questions SET title=?,content=?,category_id=?,tags=? WHERE id=?', [
    v.title,
    v.content,
    v.category,
    JSON.stringify(v.tags),
    q.id,
  ]);
  res.json({ data: { id: q.id } });
});
learningRoutes.post('/questions/:id/answers', auth, async (req, res) => {
  const v = validate(
      z.object({ content: z.string().trim().min(10).max(30000) }).strict(),
      req.body,
    ),
    [q] = await query('SELECT * FROM questions WHERE id=?', [req.params.id]);
  assert(q, 404, '问题不存在');
  const id = uid('answer');
  await transaction(async (c) => {
    await query(
      'INSERT INTO answers(id,question_id,author_id,content) VALUES(?,?,?,?)',
      [id, q.id, req.user.id, v.content],
      c,
    );
    await award(c, req.user.id, 'answer', `answer:${id}`, '回答问题');
    await notify(
      c,
      q.author_id,
      req.user.id,
      '你的问题有了新回答',
      q.title,
      'answer',
      `/questions/${q.id}`,
    );
  });
  res.status(201).json({ data: { id } });
});
learningRoutes.post('/questions/:id/accept', auth, async (req, res) => {
  const v = validate(z.object({ answerId: idSchema }).strict(), req.body);
  await transaction(async (c) => {
    const [q] = await query('SELECT * FROM questions WHERE id=? FOR UPDATE', [req.params.id], c);
    assert(q, 404, '问题不存在');
    assert(q.author_id === req.user.id, 403, '只有提问者能够采纳答案');
    if (q.accepted_answer_id === v.answerId) return;
    assert(!q.accepted_answer_id, 409, '已经采纳过一个答案');
    const [a] = await query(
      'SELECT * FROM answers WHERE id=? AND question_id=?',
      [v.answerId, q.id],
      c,
    );
    assert(a, 400, '答案不属于当前问题');
    assert(a.author_id !== req.user.id, 400, '不能采纳自己的回答');
    await query('UPDATE questions SET accepted_answer_id=? WHERE id=?', [a.id, q.id], c);
    await award(c, a.author_id, 'accepted', `accepted:${q.id}`, '回答被采纳');
    await notify(
      c,
      a.author_id,
      req.user.id,
      '你的回答被采纳了',
      q.title,
      'accepted',
      `/questions/${q.id}`,
    );
  });
  res.json({ data: { ok: true } });
});
learningRoutes.post('/answers/:id/comments', auth, async (req, res) => {
  const v = validate(z.object({ content: z.string().trim().min(1).max(2000) }).strict(), req.body);
  const [a] = await query('SELECT * FROM answers WHERE id=?', [req.params.id]);
  assert(a, 404, '回答不存在');
  const id = uid('comment');
  await transaction(async (c) => {
    await query(
      'INSERT INTO answer_comments(id,answer_id,author_id,content) VALUES(?,?,?,?)',
      [id, a.id, req.user.id, v.content],
      c,
    );
    await notify(
      c,
      a.author_id,
      req.user.id,
      '你的回答收到了评论',
      v.content,
      'comment',
      `/questions/${a.question_id}`,
    );
  });
  res.status(201).json({ data: { id } });
});
for (const [entity, table, column] of [
  ['questions', 'question_favorites', 'question_id'],
  ['answers', 'answer_likes', 'answer_id'],
])
  learningRoutes.put(
    `/${entity}/:id/${entity === 'questions' ? 'favorite' : 'like'}`,
    auth,
    async (req, res) => {
      const { active } = validate(z.object({ active: z.boolean() }).strict(), req.body);
      assert(
        (await query(`SELECT id FROM ${entity} WHERE id=?`, [req.params.id])).length,
        404,
        '内容不存在',
      );
      if (active)
        await query(`INSERT IGNORE INTO ${table}(${column},user_id) VALUES(?,?)`, [
          req.params.id,
          req.user.id,
        ]);
      else
        await query(`DELETE FROM ${table} WHERE ${column}=? AND user_id=?`, [
          req.params.id,
          req.user.id,
        ]);
      res.json({ data: { active } });
    },
  );
const courseSchema = z
  .object({
    title: z.string().trim().min(4).max(100),
    subtitle: z.string().trim().min(1).max(150),
    description: z.string().trim().min(10).max(20000),
    category: idSchema,
    hours: z.number().int().min(1).max(500),
    level: z.enum(['入门', '进阶', '通用']),
    chapters: z
      .array(
        z.object({
          id: idSchema.optional(),
          title: z.string().trim().min(1).max(100),
          content: z.string().trim().min(1).max(50000),
          duration: z.string().max(40).default('图文课程'),
        }),
      )
      .min(1)
      .max(100),
  })
  .strict();
async function saveCourse(req, res, existing) {
  const v = validate(courseSchema, req.body);
  await categoryExists(v.category);
  if (existing) owner(req, existing.teacher_id);
  const id = existing?.id || uid('course');
  await transaction(async (c) => {
    if (existing)
      await query(
        'UPDATE courses SET title=?,subtitle=?,description=?,category_id=?,hours=?,level=? WHERE id=?',
        [v.title, v.subtitle, v.description, v.category, v.hours, v.level, id],
        c,
      );
    else
      await query(
        'INSERT INTO courses(id,teacher_id,category_id,title,subtitle,description,hours,level,tags) VALUES(?,?,?,?,?,?,?,?,?)',
        [id, req.user.id, v.category, v.title, v.subtitle, v.description, v.hours, v.level, '[]'],
        c,
      );
    const old = await query('SELECT id FROM course_chapters WHERE course_id=?', [id], c),
      allowed = new Set(old.map((x) => x.id));
    const ids = v.chapters.map((ch) => ch.id || uid('chapter'));
    assert(new Set(ids).size === ids.length, 400, '章节标识不能重复');
    // Moving positions out of the final range avoids transient unique-position collisions.
    await query('UPDATE course_chapters SET position=position+1000 WHERE course_id=?', [id], c);
    for (let i = 0; i < v.chapters.length; i++) {
      const ch = v.chapters[i];
      if (allowed.has(ids[i]))
        await query(
          'UPDATE course_chapters SET title=?,content=?,duration=?,position=? WHERE id=? AND course_id=?',
          [ch.title, ch.content, ch.duration, i, ids[i], id],
          c,
        );
      else
        await query(
          'INSERT INTO course_chapters(id,course_id,title,content,duration,position) VALUES(?,?,?,?,?,?)',
          [ids[i], id, ch.title, ch.content, ch.duration, i],
          c,
        );
    }
    for (const oldChapter of old)
      if (!ids.includes(oldChapter.id))
        await query('DELETE FROM course_chapters WHERE id=?', [oldChapter.id], c);
    await query(
      'UPDATE course_enrollments SET last_chapter_id=NULL WHERE course_id=? AND last_chapter_id NOT IN (SELECT id FROM course_chapters WHERE course_id=?)',
      [id, id],
      c,
    );
    if (req.user.role === 'admin')
      await audit(c, req.user.id, `${existing ? '编辑' : '创建'}课程：${v.title}`);
  });
  res.status(existing ? 200 : 201).json({ data: { id } });
}
learningRoutes.post('/courses', role('teacher', 'admin'), (req, res) => saveCourse(req, res));
learningRoutes.patch('/courses/:id', role('teacher', 'admin'), async (req, res) => {
  const [c] = await query('SELECT * FROM courses WHERE id=?', [req.params.id]);
  assert(c, 404, '课程不存在');
  await saveCourse(req, res, c);
});
learningRoutes.post('/courses/:id/enroll', auth, async (req, res) => {
  assert(
    (await query('SELECT id FROM courses WHERE id=?', [req.params.id])).length,
    404,
    '课程不存在',
  );
  await query('INSERT IGNORE INTO course_enrollments(user_id,course_id) VALUES(?,?)', [
    req.user.id,
    req.params.id,
  ]);
  res.json({ data: { ok: true } });
});
learningRoutes.put('/courses/:id/progress', auth, async (req, res) => {
  const v = validate(
    z.object({ chapterId: idSchema, completed: z.boolean().default(false) }).strict(),
    req.body,
  );
  await transaction(async (c) => {
    assert(
      (
        await query(
          'SELECT course_id FROM course_enrollments WHERE user_id=? AND course_id=?',
          [req.user.id, req.params.id],
          c,
        )
      ).length,
      403,
      '请先加入课程',
    );
    assert(
      (
        await query(
          'SELECT id FROM course_chapters WHERE id=? AND course_id=?',
          [v.chapterId, req.params.id],
          c,
        )
      ).length,
      400,
      '章节不属于当前课程',
    );
    if (v.completed)
      await query(
        'INSERT IGNORE INTO learning_progress(user_id,course_id,chapter_id) VALUES(?,?,?)',
        [req.user.id, req.params.id, v.chapterId],
        c,
      );
    await query(
      'UPDATE course_enrollments SET last_chapter_id=?,updated_at=UTC_TIMESTAMP(3) WHERE user_id=? AND course_id=?',
      [v.chapterId, req.user.id, req.params.id],
      c,
    );
  });
  res.json({ data: { ok: true } });
});
learningRoutes.post('/checkins', auth, async (req, res) => {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  let amount = 0;
  await transaction(async (c) => {
    await query('SELECT id FROM users WHERE id=? FOR UPDATE', [req.user.id], c);
    const result = await query(
      'INSERT IGNORE INTO checkins(user_id,day) VALUES(?,?)',
      [req.user.id, day],
      c,
    );
    if (result.affectedRows)
      amount = await award(c, req.user.id, 'checkin', `checkin:${day}`, '每日签到');
  });
  res.json({ data: { day, amount } });
});
learningRoutes.patch('/notifications/read', auth, async (req, res) => {
  await query('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.id]);
  res.json({ data: { ok: true } });
});
learningRoutes.patch('/notifications/:id/read', auth, async (req, res) => {
  await query('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [
    req.params.id,
    req.user.id,
  ]);
  res.json({ data: { ok: true } });
});
learningRoutes.delete('/notifications/:id', auth, async (req, res) => {
  await query('DELETE FROM notifications WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ data: { ok: true } });
});
learningRoutes.post('/ai/drafts', auth, async (req, res) => {
  const v = validate(
    z.object({ id: idSchema.optional(), content: z.string().trim().max(12000) }).strict(),
    req.body,
  );
  const id = v.id || uid('draft');
  if (v.id) {
    const result = await query(
      'UPDATE ai_conversations SET title=?,messages=? WHERE id=? AND user_id=?',
      [
        v.content.slice(0, 22) || '新的学习草稿',
        JSON.stringify(v.content ? [{ role: 'user', content: v.content }] : []),
        id,
        req.user.id,
      ],
    );
    assert(result.affectedRows, 404, '草稿不存在');
  } else
    await query('INSERT INTO ai_conversations(id,user_id,title,messages) VALUES(?,?,?,?)', [
      id,
      req.user.id,
      v.content.slice(0, 22) || '新的学习草稿',
      JSON.stringify(v.content ? [{ role: 'user', content: v.content }] : []),
    ]);
  res.json({ data: { id } });
});
learningRoutes.delete('/ai/drafts/:id', auth, async (req, res) => {
  await query('DELETE FROM ai_conversations WHERE id=? AND user_id=?', [
    req.params.id,
    req.user.id,
  ]);
  res.json({ data: { ok: true } });
});
learningRoutes.post('/ai/chat', auth, (_req, _res) => {
  assert(false, 503, 'AI 服务尚未接入；学习草稿可以正常使用');
});
