import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { app } from '../app.mjs';
import { pool, query, iso } from '../db.mjs';
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
test('历史无效日期不会中断页面数据读取', () => {
  assert.equal(iso('0000-00-00 00:00:00.000'), undefined);
  assert.equal(iso('0000-00-00T00:00:00.000000Z'), undefined);
  assert.equal(iso(null), undefined);
  assert.equal(iso('2026-10-28T00:00:00.000000Z'), '2026-10-28T00:00:00.000Z');
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
  assert.equal(result.body.data.status, 'pending');
  assert.equal((await client().call('/api/posts/' + postId)).status, 404);
  const guestSnapshot = await client().call('/api/bootstrap');
  const ownSnapshot = await alice.call('/api/bootstrap');
  const otherSnapshot = await bob.call('/api/bootstrap');
  const adminSnapshot = await admin.call('/api/bootstrap');
  assert.equal(ownSnapshot.status, 200);
  assert.equal(adminSnapshot.status, 200);
  assert.ok(!guestSnapshot.body.data.state.posts.some((p) => p.id === postId));
  assert.ok(!otherSnapshot.body.data.state.posts.some((p) => p.id === postId));
  assert.equal(ownSnapshot.body.data.state.posts.find((p) => p.id === postId)?.status, 'pending');
  assert.equal(adminSnapshot.body.data.state.posts.find((p) => p.id === postId)?.status, 'pending');
  assert.equal(ownSnapshot.headers.get('cache-control'), 'private, no-store');
  for (const key of [
    'notifications',
    'enrollments',
    'checkins',
    'points',
    'history',
    'conversations',
  ]) {
    assert.ok(
      ownSnapshot.body.data.state[key].every((row) => row.userId === alice.id),
      key,
    );
    assert.deepEqual(guestSnapshot.body.data.state[key], [], key);
  }
  assert.deepEqual(ownSnapshot.body.data.state.logs, []);
  const [unread] = await query(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND is_read=0',
    [alice.id],
  );
  assert.equal(ownSnapshot.body.data.unreadCount, unread.n);
  assert.equal(
    (await bob.call('/api/admin/posts/' + postId + '/review', 'POST', { approved: true })).status,
    403,
  );
  assert.equal(
    (await admin.call('/api/admin/posts/' + postId + '/review', 'POST', { approved: true })).status,
    200,
  );
  const comment = await bob.call(`/api/posts/${postId}/comments`, 'POST', {
    content: '这条评论通过后端写入云数据库，可以由其他客户端重新读取。',
  });
  assert.equal(comment.status, 201);
  replyId = comment.body.data.id;
  const fresh = await client().call(`/api/posts/${postId}`);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.data.image, '/images/community/coding.jpg');
  assert.equal(fresh.body.data.comments[0].id, replyId);
  const refreshed = await client().call('/api/bootstrap');
  assert.equal(
    refreshed.body.data.state.posts.find((p) => p.id === postId)?.comments[0]?.id,
    replyId,
  );
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
  assert.equal((await client().call('/api/posts/' + postId)).status, 404);
  assert.equal(
    (await admin.call('/api/admin/posts/' + postId + '/review', 'POST', { approved: true })).status,
    200,
  );
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
  const [rule] = await query("SELECT amount FROM point_rules WHERE code='checkin'");
  assert.equal(Number(ledger.total), rule.amount);
});
test('全站 SQL 搜索覆盖五种实体，分类与公告支持编辑、停用和草稿发布', async () => {
  for (const list of ['notices', 'comments', 'logs']) {
    const r = await admin.call('/api/admin/lists/' + list + '?pageSize=1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.data.items.length <= 1);
    assert.equal((await alice.call('/api/admin/lists/' + list)).status, 403);
  }
  assert.equal((await admin.call('/api/admin/activity')).status, 200);
  const extra = [];
  try {
    let r = await admin.call('/api/admin/categories', 'POST', {
      name: `审计${stamp}`,
      description: '自动化测试临时分类',
    });
    assert.equal(r.status, 201);
    const category = r.body.data.id;
    extra.push(['categories', category]);
    assert.equal(
      (
        await admin.call('/api/admin/categories/' + category, 'PATCH', {
          description: '更新后的分类描述',
          enabled: false,
        })
      ).status,
      200,
    );
    r = await alice.call('/api/questions', 'POST', {
      title: '停用分类不能发布新问题',
      content: '这个问题用于验证分类已停用后是否阻止发布。',
      category,
      tags: [],
    });
    assert.equal(r.status, 400);
    r = await admin.call('/api/admin/notices', 'POST', {
      title: `草稿公告 ${stamp}`,
      content: '这份临时公告用于验证编辑、草稿、发布和删除业务。',
      type: '公告',
      status: 'draft',
    });
    assert.equal(r.status, 201);
    const id = r.body.data.id;
    extra.push(['announcements', id]);
    assert.ok(
      !(await client().call('/api/announcements?pageSize=50')).body.data.items.some(
        (n) => n.id === id,
      ),
    );
    assert.equal(
      (
        await admin.call('/api/admin/notices/' + id, 'PATCH', {
          title: `已发布公告 ${stamp}`,
          status: 'published',
          pinned: true,
        })
      ).status,
      200,
    );
    assert.ok(
      (await client().call('/api/announcements?pageSize=50')).body.data.items.some(
        (n) => n.id === id && n.pinned,
      ),
    );
    for (const type of ['帖子', '课程', '问答', '资源', '用户']) {
      const spec = {
        帖子: ['posts', 'title', "status='published'"],
        课程: ['courses', 'title', '1=1'],
        问答: ['questions', 'title', '1=1'],
        资源: ['resources', 'title', "status='approved'"],
        用户: ['users', 'name', "status='active'"],
      }[type];
      const [existing] = await query(
        `SELECT ${spec[1]} AS text FROM ${spec[0]} WHERE ${spec[2]} LIMIT 1`,
      );
      const result = await client().call(
        '/api/search?' + new URLSearchParams({ q: existing.text.slice(0, 4), type, pageSize: '2' }),
      );
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.ok(result.body.data.total > 0, type);
      assert.ok(result.body.data.items.length <= 2);
      assert.ok(result.body.data.items.every((x) => x.type === type));
    }
    const injection = await client().call('/api/search?q=' + encodeURIComponent("' OR 1=1 --"));
    assert.equal(injection.body.data.total, 0);
  } finally {
    for (const [table, id] of extra) await query(`DELETE FROM ${table} WHERE id=?`, [id]);
  }
});
test('悬赏真实冻结、余额检查、并发采纳只结算一次，未结算删除退款', async () => {
  await alice.call('/api/checkins', 'POST');
  const ids = [];
  try {
    const before = (await query('SELECT points FROM users WHERE id=?', [alice.id]))[0].points;
    const body = {
      title: `悬赏问题测试 ${stamp}`,
      content: '请说明如何以事务保证积分悬赏只结算一次并留下完整记录。',
      category: 'tech',
      tags: [],
      bounty: 1,
    };
    const key = `bounty-test-${stamp}`;
    const first = await alice.call('/api/questions', 'POST', body, { 'Idempotency-Key': key });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const id = first.body.data.id;
    ids.push(id);
    assert.equal(
      (await alice.call('/api/questions', 'POST', body, { 'Idempotency-Key': key })).body.data.id,
      id,
    );
    assert.equal(
      (await query('SELECT points FROM users WHERE id=?', [alice.id]))[0].points,
      before - 1,
    );
    const a = await bob.call('/api/questions/' + id + '/answers', 'POST', {
      content: '先锁定问题行，积分流水使用唯一事件键，更新余额和状态放在同一事务。',
    });
    assert.equal(a.status, 201);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        alice.call('/api/questions/' + id + '/accept', 'POST', { answerId: a.body.data.id }),
      ),
    );
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(
      (await query('SELECT bounty_status FROM questions WHERE id=?', [id]))[0].bounty_status,
      'paid',
    );
    const [ledger] = await query(
      'SELECT COUNT(*) AS n,SUM(amount) AS amount FROM point_records WHERE user_id=? AND event_key=?',
      [bob.id, 'bounty-paid:' + id],
    );
    assert.equal(ledger.n, 1);
    assert.equal(Number(ledger.amount), 1);
    const next = await alice.call('/api/questions', 'POST', body);
    assert.equal(next.status, 201);
    const refundId = next.body.data.id;
    ids.push(refundId);
    assert.equal((await alice.call('/api/questions/' + refundId, 'DELETE')).status, 200);
    assert.equal(
      (await query('SELECT points FROM users WHERE id=?', [alice.id]))[0].points,
      before - 1,
    );
    const poor = await alice.call('/api/questions', 'POST', { ...body, bounty: 1000 });
    assert.equal(poor.status, 409);
  } finally {
    for (const id of ids) await query('DELETE FROM questions WHERE id=?', [id]);
  }
});
test('个人记录独立分页、精确导出、通知权限与真实成长榜', async () => {
  for (const kind of [
    'posts',
    'questions',
    'resources',
    'learning',
    'points',
    'history',
    'comments',
    'answers',
    'downloads',
  ]) {
    const r = await alice.call('/api/me/' + kind + '?pageSize=1');
    assert.equal(r.status, 200, kind + JSON.stringify(r.body));
    assert.ok(r.body.data.items.length <= 1);
  }
  const exported = await alice.call('/api/me/export?scopes=profile,points');
  assert.equal(exported.status, 200);
  assert.equal(exported.body.data.profile.id, alice.id);
  assert.ok(!('posts' in exported.body.data));
  assert.ok(!('password_hash' in exported.body.data.profile));
  assert.equal((await alice.call('/api/me/export?scopes=sessions')).status, 400);
  assert.equal((await client().call('/api/me/points')).status, 401);
  const rank = await alice.call('/api/leaderboard?pageSize=2');
  assert.equal(rank.status, 200);
  assert.equal(rank.body.data.items.length, 2);
  assert.ok(rank.body.data.total >= 30);
  assert.ok(rank.body.data.myRank > 0);
  const growth = await alice.call('/api/me/growth');
  assert.equal(growth.status, 200);
  assert.ok(Array.isArray(growth.body.data.badges));
  const notes = await alice.call('/api/notifications?pageSize=1');
  assert.equal(notes.status, 200);
  const id = notes.body.data.items[0]?.id;
  if (id) {
    await bob.call('/api/notifications/' + id, 'DELETE');
    assert.equal((await query('SELECT id FROM notifications WHERE id=?', [id])).length, 1);
    await alice.call('/api/notifications/' + id + '/read', 'PATCH');
    assert.equal((await query('SELECT is_read FROM notifications WHERE id=?', [id]))[0].is_read, 1);
    await alice.call('/api/notifications/' + id, 'DELETE');
    assert.equal((await query('SELECT id FROM notifications WHERE id=?', [id])).length, 0);
  }
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
test('课程评价必须报名，重复提交更新同一条并按真实评价计算评分', async () => {
  const body = { rating: 4, content: '课程结构清楚，练习内容能够帮助我验证理解。' };
  assert.equal((await bob.call('/api/courses/' + courseId + '/review', 'PUT', body)).status, 403);
  assert.equal(
    (await client().call('/api/courses/' + courseId + '/review', 'PUT', body)).status,
    401,
  );
  for (const rating of [4, 5])
    assert.equal(
      (await alice.call('/api/courses/' + courseId + '/review', 'PUT', { ...body, rating })).status,
      200,
    );
  const r = await client().call('/api/courses/' + courseId + '/reviews');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, 1);
  assert.equal(r.body.data.average, 5);
  assert.equal((await query('SELECT rating FROM courses WHERE id=?', [courseId]))[0].rating, 5);
  const chapters = await query('SELECT id FROM course_chapters WHERE course_id=?', [courseId]);
  for (const ch of chapters)
    await alice.call('/api/courses/' + courseId + '/progress', 'PUT', {
      chapterId: ch.id,
      completed: true,
    });
  const g = await alice.call('/api/me/growth');
  assert.ok(g.body.data.badges.some((b) => b.name === '学有所成'));
  assert.equal(
    (await alice.call('/api/courses/' + courseId + '/review/' + r.body.data.items[0].id, 'DELETE'))
      .status,
    200,
  );
  assert.equal((await query('SELECT rating FROM courses WHERE id=?', [courseId]))[0].rating, 0);
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
  const records = await alice.call('/api/me/downloads');
  assert.ok(records.body.data.items.some((d) => d.resourceId === resourceId));
  const updated = {
    title: `更新资源 ${stamp}`,
    description: '这是更新后的资源介绍，应该重新进入待审核状态。',
    category: 'tech',
    tags: [],
  };
  assert.equal((await bob.call('/api/resources/' + resourceId, 'PATCH', updated)).status, 403);
  assert.equal((await alice.call('/api/resources/' + resourceId, 'PATCH', updated)).status, 200);
  assert.equal((await alice.call('/api/resources/' + resourceId + '/download')).status, 403);
  assert.equal(
    (await admin.call('/api/admin/resources/' + resourceId + '/review', 'POST', { approved: true }))
      .status,
    200,
  );
  assert.equal((await alice.call(`/api/admin/resources/${resourceId}`, 'DELETE')).status, 403);
  assert.equal((await admin.call(`/api/admin/resources/${resourceId}`, 'DELETE')).status, 200);
  assert.equal(
    (await query('SELECT id FROM resource_downloads WHERE resource_id=?', [resourceId])).length,
    0,
  );
  await assert.rejects(stat(path.join(storageDir, resourceKey)), { code: 'ENOENT' });
  assert.equal((await alice.call(`/api/resources/${resourceId}/download`)).status, 404);
});
test('AI 未配置提示、真实 SSE 协议调用、连续历史、失败重试、停止和归属检查', async () => {
  const saved = Object.fromEntries(
    ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'].map((k) => [k, process.env[k]]),
  );
  delete process.env.AI_API_KEY;
  assert.equal((await alice.call('/api/ai/status')).body.data.configured, false);
  assert.equal((await alice.call('/api/ai/chat', 'POST', {})).status, 503);
  let calls = 0,
    inputs = [],
    retryFailed = false,
    stopped;
  const mock = createServer(async (req, res) => {
    let body = '';
    for await (const b of req) body += b;
    const input = JSON.parse(body);
    inputs.push(input);
    calls++;
    assert.equal(req.headers.authorization, 'Bearer test-only-not-a-real-key');
    if (input.messages.at(-1).content === '失败重试测试' && !retryFailed) {
      retryFailed = true;
      res.writeHead(429);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const emit = (x) => res.write('data: ' + JSON.stringify(x) + '\n\n');
    if (input.messages.at(-1).content === '停止生成测试') {
      emit({ choices: [{ delta: { content: '部分回答' } }] });
      req.on('close', () => {
        stopped = true;
      });
      return;
    }
    emit({ choices: [{ delta: { content: '测试模型返回：' } }] });
    emit({ choices: [{ delta: { content: input.messages.at(-1).content } }] });
    emit({ choices: [{ delta: {}, finish_reason: 'stop' }] });
    res.end('data: [DONE]\n\n');
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  process.env.AI_BASE_URL = `http://127.0.0.1:${mock.address().port}/v1`;
  process.env.AI_API_KEY = 'test-only-not-a-real-key';
  process.env.AI_MODEL = 'test-model';
  let id;
  try {
    const made = await alice.call('/api/ai/conversations', 'POST', {});
    assert.equal(made.status, 201);
    id = made.body.data.id;
    const send = (content, requestKey) =>
      alice.call('/api/ai/conversations/' + id + '/messages', 'POST', { content, requestKey });
    let r = await send('第一条学习问题', 'ai-first-' + stamp);
    assert.equal(r.status, 200);
    assert.ok(r.body.includes('测试模型返回'));
    assert.ok(r.body.includes('"type":"done"'));
    await send('第一条学习问题', 'ai-first-' + stamp);
    assert.equal(calls, 1);
    r = await send('第二条学习问题', 'ai-second-' + stamp);
    assert.ok(r.body.includes('done'));
    assert.ok(
      inputs
        .at(-1)
        .messages.some((m) => m.role === 'assistant' && m.content.includes('第一条学习问题')),
    );
    r = await send('失败重试测试', 'ai-retry-' + stamp);
    assert.ok(r.body.includes('"type":"error"'));
    r = await send('失败重试测试', 'ai-retry-' + stamp);
    assert.ok(r.body.includes('"type":"done"'));
    assert.equal((await bob.call('/api/ai/conversations/' + id)).status, 404);
    const pending = send('停止生成测试', 'ai-stop-' + stamp);
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const row = (
        await query(
          "SELECT status FROM ai_messages WHERE conversation_id=? AND request_key=? AND role='assistant'",
          [id, 'ai-stop-' + stamp],
        )
      )[0];
      if (row?.status === 'pending') {
        await alice.call('/api/ai/conversations/' + id + '/stop', 'POST');
        break;
      }
    }
    r = await pending;
    assert.ok(r.body.includes('cancelled'));
    const history = await alice.call('/api/ai/conversations/' + id);
    assert.equal(history.status, 200);
    assert.equal(
      history.body.data.messages.filter(
        (m) => m.requestKey === 'ai-retry-' + stamp && m.role === 'user',
      ).length,
      1,
    );
    assert.equal(history.body.data.messages.at(-1).status, 'cancelled');
    assert.equal((await alice.call('/api/ai/conversations/' + id, 'DELETE')).status, 200);
    assert.equal((await alice.call('/api/ai/conversations/' + id)).status, 404);
  } finally {
    if (id) await query('DELETE FROM ai_conversations WHERE id=?', [id]);
    mock.closeAllConnections();
    await new Promise((resolve) => mock.close(resolve));
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
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
