import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { app } from '../app.mjs';
import { pool, query } from '../db.mjs';
import { privateRead, storageDir } from '../config.mjs';
import { seed } from '../seed.mjs';

let server,
  base,
  alice,
  bob,
  admin,
  postId,
  replyId,
  questionId,
  answerId,
  courseId,
  resourceId,
  resourceKey;
const stamp = randomBytes(6).toString('hex'),
  password = `Test-${randomBytes(18).toString('hex')}-7a!`;
const createdUsers = [];
function client() {
  return {
    cookie: '',
    csrf: '',
    async call(endpoint, method = 'GET', body, extra = {}) {
      const form = body instanceof FormData;
      const headers = {
        origin: 'http://127.0.0.1:5173',
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}),
        ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
        ...extra,
      };
      const response = await fetch(base + endpoint, {
        method,
        headers,
        body: body ? (form ? body : JSON.stringify(body)) : undefined,
      });
      const cookie = response.headers.get('set-cookie');
      if (cookie) this.cookie = cookie.split(';')[0];
      const payload = (response.headers.get('content-type') || '').includes('application/json')
        ? await response.json()
        : await response.text();
      if (payload?.data?.csrfToken) this.csrf = payload.data.csrfToken;
      return { status: response.status, body: payload, headers: response.headers };
    },
  };
}
async function register(who) {
  const c = client();
  c.email = `qa-${stamp}-${who}@learnhub.example.invalid`;
  c.password = password;
  const r = await c.call('/api/auth/register', 'POST', {
    email: c.email,
    name: `验收用户${who}`,
    password,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  c.id = r.body.data.user.id;
  createdUsers.push(c.id);
  return c;
}
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  alice = await register('A');
  bob = await register('B');
  admin = client();
  const credential = privateRead('demo-accounts.dpapi').find((a) => a.role === 'admin');
  const r = await admin.call('/api/auth/login', 'POST', {
    email: credential.email,
    password: credential.password,
  });
  assert.equal(r.status, 200);
});
after(async () => {
  try {
    if (resourceId)
      await query('DELETE FROM resources WHERE id=? AND author_id=?', [resourceId, alice.id]);
    if (courseId)
      await query('DELETE FROM courses WHERE id=? AND teacher_id=?', [courseId, bob.id]);
    if (questionId)
      await query('DELETE FROM questions WHERE id=? AND author_id=?', [questionId, alice.id]);
    if (postId) await query('DELETE FROM posts WHERE id=? AND author_id=?', [postId, alice.id]);
    for (const id of createdUsers) {
      await query('DELETE FROM point_records WHERE user_id=?', [id]);
      await query('DELETE FROM resource_downloads WHERE user_id=?', [id]);
      await query('DELETE FROM users WHERE id=?', [id]);
    }
    if (resourceKey) await unlink(path.join(storageDir, resourceKey)).catch(() => {});
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
test('真实注册、密码散列、登录状态与公共隐私边界', async () => {
  const [u] = await query('SELECT password_hash,role FROM users WHERE id=?', [alice.id]);
  assert.ok(u.password_hash.startsWith('scrypt$'));
  assert.notEqual(u.password_hash, password);
  assert.equal(u.role, 'student');
  const me = await alice.call('/api/auth/me');
  assert.equal(me.body.data.user.id, alice.id);
  assert.ok(alice.cookie);
  assert.ok(alice.csrf);
  const duplicate = await client().call('/api/auth/register', 'POST', {
    email: alice.email,
    name: '重复用户',
    password,
  });
  assert.equal(duplicate.status, 409);
  const injection = await client().call('/api/auth/register', 'POST', {
    email: `qa-${stamp}-bad@learnhub.example.invalid`,
    name: '非法角色',
    password,
    role: 'admin',
  });
  assert.equal(injection.status, 400);
  const wrong = await client().call('/api/auth/login', 'POST', {
    email: alice.email,
    password: 'Wrong-password-12345',
  });
  assert.equal(wrong.status, 401);
  const initialAvatar = '/images/community/fox-avatar.png';
  await query('UPDATE users SET avatar=? WHERE id=?', [initialAvatar, alice.id]);
  assert.equal(
    (
      await alice.call('/api/auth/profile', 'PATCH', {
        name: '验收用户A',
        bio: '验证保留当前演示头像',
        avatar: initialAvatar,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await alice.call('/api/auth/profile', 'PATCH', {
        name: '验收用户A',
        bio: '拒绝任意远程头像',
        avatar: 'https://untrusted.invalid/avatar.png',
      })
    ).status,
    400,
  );
  const snapshot = await client().call('/api/bootstrap');
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.body.data.user, null);
  assert.deepEqual(snapshot.body.data.state.notifications, []);
  assert.ok(
    snapshot.body.data.state.users.every((u) => !('password_hash' in u) && !('email' in u)),
  );
});
test('服务端阻止游客写入、普通用户管理访问与 CSRF', async () => {
  assert.equal((await client().call('/api/posts', 'POST', {})).status, 401);
  assert.equal((await alice.call('/api/admin/users')).status, 403);
  assert.equal((await client().call('/api/admin/users')).status, 401);
  assert.equal((await alice.call('/api/posts', 'POST', {}, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal(
    (await alice.call('/api/posts', 'POST', {}, { origin: 'https://untrusted.invalid' })).status,
    403,
  );
});
test('发帖与评论真正写入云数据库，独立客户端可重新读取', async () => {
  const result = await alice.call('/api/posts', 'POST', {
    title: `真实数据库闭环 ${stamp}`,
    content: '这是一个经过真实接口写入的项目验收帖子，用于验证数据库持久化、权限和前后端联调。',
    category: 'tech',
    type: '分享',
    tags: ['接口验收'],
    image: '/images/community/coding.jpg',
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  postId = result.body.data.id;
  const comment = await bob.call(`/api/posts/${postId}/comments`, 'POST', {
    content: '这条评论通过后端写入云数据库，可以由其他客户端重新读取。',
  });
  assert.equal(comment.status, 201);
  replyId = comment.body.data.id;
  const fresh = await client().call(`/api/posts/${postId}`);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.data.image, '/images/community/coding.jpg');
  assert.equal(fresh.body.data.comments[0].id, replyId);
  const [stored] = await query('SELECT title FROM posts WHERE id=?', [postId]);
  assert.equal(stored.title, `真实数据库闭环 ${stamp}`);
  const [count] = await query('SELECT COUNT(*) AS n FROM post_comments WHERE post_id=?', [postId]);
  assert.equal(count.n, 1);
});
test('编辑和删除校验归属，回复必须属于当前帖子', async () => {
  const body = {
    title: `更新后的验收帖子 ${stamp}`,
    content: '更新后的正文仍通过真实 API 写入数据库，其他用户不能越权编辑或删除这条学习记录。',
    category: 'tech',
    type: '讨论',
    tags: [],
  };
  assert.equal((await bob.call(`/api/posts/${postId}`, 'PATCH', body)).status, 403);
  assert.equal((await bob.call(`/api/posts/${postId}`, 'DELETE')).status, 403);
  assert.equal((await alice.call(`/api/posts/${postId}`, 'PATCH', body)).status, 200);
  assert.equal(
    (
      await alice.call(`/api/posts/p1/comments`, 'POST', {
        content: '错误的跨帖子回复',
        parentId: replyId,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await alice.call(`/api/posts/${postId}/comments`, 'POST', {
        content: '正确回复当前帖子的评论。',
        parentId: replyId,
      })
    ).status,
    201,
  );
  assert.equal((await alice.call(`/api/comments/${replyId}`, 'DELETE')).status, 403);
});
test('点赞收藏使用唯一约束与幂等开关', async () => {
  for (const kind of ['like', 'favorite']) {
    const table = kind === 'like' ? 'post_likes' : 'post_favorites';
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await alice.call(`/api/posts/${postId}/${kind}`, 'PUT', { active: true })).status,
        200,
      );
    const [row] = await query(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=? AND post_id=?`, [
      alice.id,
      postId,
    ]);
    assert.equal(row.n, 1);
    assert.equal(
      (await alice.call(`/api/posts/${postId}/${kind}`, 'PUT', { active: false })).status,
      200,
    );
    const [after] = await query(
      `SELECT COUNT(*) AS n FROM ${table} WHERE user_id=? AND post_id=?`,
      [alice.id, postId],
    );
    assert.equal(after.n, 0);
  }
});
test('数据库分页、关键词查询和排序生效，注入字符串不改变查询结构', async () => {
  const page = await client().call('/api/posts?page=2&pageSize=8&sort=hot');
  assert.equal(page.status, 200);
  assert.equal(page.body.data.items.length, 8);
  assert.ok(page.body.data.total >= 100);
  assert.equal(page.body.data.page, 2);
  const search = await client().call('/api/posts?q=' + encodeURIComponent(stamp));
  assert.equal(search.status, 200);
  assert.equal(search.body.data.total, 1);
  assert.equal(search.body.data.items[0].id, postId);
  const injection = await client().call('/api/posts?q=' + encodeURIComponent("' OR 1=1 --"));
  assert.equal(injection.status, 200);
  assert.equal(injection.body.data.total, 0);
  assert.equal((await client().call('/api/posts?pageSize=5000')).status, 400);
});
test('签到并发请求只记一次积分', async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () => alice.call('/api/checkins', 'POST')),
  );
  assert.ok(results.every((r) => r.status === 200));
  const [count] = await query('SELECT COUNT(*) AS n FROM checkins WHERE user_id=?', [alice.id]);
  assert.equal(count.n, 1);
  const [ledger] = await query(
    "SELECT COUNT(*) AS n,SUM(amount) AS total FROM point_records WHERE user_id=? AND event_key LIKE 'checkin:%'",
    [alice.id],
  );
  assert.equal(ledger.n, 1);
  assert.equal(Number(ledger.total), 2);
});
test('问答采纳必须由提问者执行且只奖励一次', async () => {
  let r = await alice.call('/api/questions', 'POST', {
    title: `验收学习问题 ${stamp}`,
    content: '如何把学习过程中的实践记录整理成可以复查的验收证据？',
    category: 'tech',
    tags: ['测试'],
  });
  assert.equal(r.status, 201);
  questionId = r.body.data.id;
  r = await bob.call(`/api/questions/${questionId}/answers`, 'POST', {
    content: '可以把目标、操作步骤、输入数据、预期结果和实际结果逐项记录，再保留可复查的证据。',
  });
  assert.equal(r.status, 201);
  answerId = r.body.data.id;
  assert.equal(
    (await bob.call(`/api/questions/${questionId}/accept`, 'POST', { answerId })).status,
    403,
  );
  assert.equal(
    (await alice.call(`/api/questions/${questionId}/accept`, 'POST', { answerId })).status,
    200,
  );
  assert.equal(
    (await alice.call(`/api/questions/${questionId}/accept`, 'POST', { answerId })).status,
    200,
  );
  const [p] = await query(
    'SELECT COUNT(*) AS n,SUM(amount) AS points FROM point_records WHERE user_id=? AND event_key=?',
    [bob.id, `accepted:${questionId}`],
  );
  assert.equal(p.n, 1);
  assert.equal(Number(p.points), 10);
});
test('教师权限、课程创建、章节唯一进度和归属检查', async () => {
  const course = {
    title: `验收课程 ${stamp}`,
    subtitle: '真实课程与学习记录',
    description: '这门验收课程通过服务端创建，课程章节和完成进度都写入数据库。',
    category: 'tech',
    hours: 4,
    level: '入门',
    chapters: [
      { title: '第一章', content: '学习目标与实际练习。', duration: '10 分钟' },
      { title: '第二章', content: '复盘思路与验证结果。', duration: '10 分钟' },
    ],
  };
  assert.equal((await alice.call('/api/courses', 'POST', course)).status, 403);
  assert.equal(
    (await admin.call(`/api/admin/users/${bob.id}`, 'PATCH', { role: 'teacher' })).status,
    200,
  );
  assert.equal((await bob.call('/api/courses', 'POST', course)).status, 401);
  assert.equal(
    (await bob.call('/api/auth/login', 'POST', { email: bob.email, password })).status,
    200,
  );
  const created = await bob.call('/api/courses', 'POST', course);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  courseId = created.body.data.id;
  assert.equal((await alice.call(`/api/courses/${courseId}/enroll`, 'POST')).status, 200);
  const chapters = await query(
    'SELECT id FROM course_chapters WHERE course_id=? ORDER BY position',
    [courseId],
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await alice.call(`/api/courses/${courseId}/progress`, 'PUT', {
          chapterId: chapters[0].id,
          completed: true,
        })
      ).status,
      200,
    );
  const [n] = await query(
    'SELECT COUNT(*) AS n FROM learning_progress WHERE user_id=? AND course_id=?',
    [alice.id, courseId],
  );
  assert.equal(n.n, 1);
  assert.equal(
    (
      await alice.call(`/api/courses/${courseId}/progress`, 'PUT', {
        chapterId: 'ai-1',
        completed: true,
      })
    ).status,
    400,
  );
});
test('资源上传校验、审核权限、实际文件下载与统计', async () => {
  function form(filename, content) {
    const data = new FormData();
    data.append('file', new Blob([content], { type: 'text/plain' }), filename);
    data.append('title', `验收资源 ${stamp}`);
    data.append('description', '这是用于验证上传校验、资源审核与真实下载的测试学习资料。');
    data.append('category', 'tech');
    data.append('tags', '["测试"]');
    return data;
  }
  assert.equal(
    (await alice.call('/api/resources', 'POST', form('fake.pdf', 'not a PDF'))).status,
    400,
  );
  const uploaded = await alice.call(
    '/api/resources',
    'POST',
    form('verification.txt', `Cloud-backed resource ${stamp}`),
  );
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  resourceId = uploaded.body.data.id;
  resourceKey = (await query('SELECT storage_key FROM resources WHERE id=?', [resourceId]))[0]
    .storage_key;
  assert.equal((await alice.call(`/api/resources/${resourceId}/download`)).status, 403);
  assert.equal(
    (await alice.call(`/api/admin/resources/${resourceId}/review`, 'POST', { approved: true }))
      .status,
    403,
  );
  assert.equal(
    (await admin.call(`/api/admin/resources/${resourceId}/review`, 'POST', { approved: true }))
      .status,
    200,
  );
  assert.equal(
    (await admin.call(`/api/admin/resources/${resourceId}/review`, 'POST', { approved: true }))
      .status,
    409,
  );
  const download = await alice.call(`/api/resources/${resourceId}/download`);
  assert.equal(download.status, 200);
  assert.equal(download.body, `Cloud-backed resource ${stamp}`);
  const [r] = await query('SELECT downloads FROM resources WHERE id=?', [resourceId]);
  assert.equal(r.downloads, 1);
  assert.equal((await alice.call(`/api/admin/resources/${resourceId}`, 'DELETE')).status, 403);
  assert.equal((await admin.call(`/api/admin/resources/${resourceId}`, 'DELETE')).status, 200);
  assert.equal(
    (await query('SELECT id FROM resource_downloads WHERE resource_id=?', [resourceId])).length,
    0,
  );
  await assert.rejects(stat(path.join(storageDir, resourceKey)), { code: 'ENOENT' });
  assert.equal((await alice.call(`/api/resources/${resourceId}/download`)).status, 404);
});
test('管理员封禁会撤销会话，启用后可重新登录', async () => {
  assert.equal(
    (await admin.call(`/api/admin/users/${bob.id}`, 'PATCH', { status: 'banned' })).status,
    200,
  );
  assert.equal((await bob.call('/api/auth/me')).body.data.user, null);
  assert.equal(
    (await bob.call('/api/auth/login', 'POST', { email: bob.email, password })).status,
    401,
  );
  assert.equal(
    (await admin.call(`/api/admin/users/${bob.id}`, 'PATCH', { status: 'active' })).status,
    200,
  );
  assert.equal(
    (await bob.call('/api/auth/login', 'POST', { email: bob.email, password })).status,
    200,
  );
});
test('密码修改和退出登录让旧会话失效', async () => {
  const nextPassword = `Changed-${password}`;
  assert.equal(
    (
      await alice.call('/api/auth/password', 'POST', {
        currentPassword: 'incorrect',
        newPassword: nextPassword,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await alice.call('/api/auth/password', 'POST', {
        currentPassword: password,
        newPassword: nextPassword,
      })
    ).status,
    200,
  );
  assert.equal((await alice.call('/api/auth/me')).body.data.user, null);
  assert.equal(
    (await alice.call('/api/auth/login', 'POST', { email: alice.email, password: nextPassword }))
      .status,
    200,
  );
  assert.equal((await alice.call('/api/auth/logout', 'POST')).status, 200);
  assert.equal(
    (await alice.call(`/api/posts/${postId}/like`, 'PUT', { active: true })).status,
    401,
  );
});
test('重复初始化保留已有业务记录，演示资源均有实际文件', async () => {
  const [before] = await query('SELECT COUNT(*) AS n FROM posts');
  await seed();
  const [after] = await query('SELECT COUNT(*) AS n FROM posts');
  assert.equal(after.n, before.n);
  const [counts] = await query(
    "SELECT (SELECT COUNT(*) FROM course_chapters) AS chapters,(SELECT COUNT(*) FROM resources WHERE id REGEXP '^r[0-9]+$') AS resources",
  );
  assert.ok(counts.chapters >= 80);
  assert.equal(counts.resources, 50);
  const { stat } = await import('node:fs/promises');
  for (const r of await query("SELECT storage_key FROM resources WHERE id REGEXP '^r[0-9]+$'"))
    assert.ok((await stat(path.join(storageDir, r.storage_key))).size > 0);
});
