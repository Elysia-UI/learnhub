<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCommunity } from '../stores/community';
import { dayKey } from '../services/storage';
import { roleName, timeAgo } from '../services/format';
import { api } from '../services/api';
import Pagination from '../components/Pagination.vue';
import Icon from '../components/Icon.vue';
import Avatar from '../components/Avatar.vue';
import EmptyState from '../components/EmptyState.vue';
import ActivityChart from '../components/ActivityChart.vue';
const store = useCommunity(),
  tab = ref('overview'),
  query = ref(''),
  noticeTitle = ref(''),
  noticeContent = ref(''),
  noticeType = ref('公告'),
  categoryName = ref(''),
  categoryDescription = ref(''),
  categoryEdit = ref(''),
  noticeEdit = ref(''),
  noticeStatus = ref('published');
const tabs = [
  { id: 'overview', label: '数据概览', icon: 'ChartNoAxesCombined' },
  { id: 'users', label: '用户管理', icon: 'Users' },
  { id: 'posts', label: '帖子管理', icon: 'MessageSquare' },
  { id: 'comments', label: '评论管理', icon: 'MessagesSquare' },
  { id: 'courses', label: '课程管理', icon: 'BookOpen' },
  { id: 'resources', label: '资源审核', icon: 'FolderOpen' },
  { id: 'questions', label: '问答管理', icon: 'CircleHelp' },
  { id: 'categories', label: '分类管理', icon: 'LayoutGrid' },
  { id: 'notices', label: '公告管理', icon: 'Megaphone' },
  { id: 'points', label: '积分规则', icon: 'Award' },
  { id: 'logs', label: '操作日志', icon: 'Clock3' },
  { id: 'config', label: '系统信息', icon: 'Settings' },
];
const allowed = computed(() => store.currentUser?.role === 'admin');
const stats = computed(() => [
  { label: '社区用户', value: store.data.stats?.users || 0, icon: 'Users', color: 'blue' },
  {
    label: '论坛帖子',
    value: store.data.stats?.posts || 0,
    icon: 'MessageSquare',
    color: 'purple',
  },
  { label: '学习课程', value: store.data.stats?.courses || 0, icon: 'BookOpen', color: 'teal' },
  {
    label: '待审资源',
    value: store.data.stats?.pendingResources || 0,
    icon: 'FolderOpen',
    color: 'orange',
  },
]);
const allComments = computed(() =>
  store.data.posts.flatMap((p) => p.comments.map((c) => ({ ...c, post: p }))),
);
const filteredUsers = computed(() => adminItems.value);
function confirm(title: string, content: string, action: () => unknown) {
  store.modal = {
    type: 'confirm',
    payload: {
      title,
      content,
      onConfirm: async () => {
        if (allowed.value) await action();
      },
    },
  };
}
async function setRole(id: string, value: string) {
  try {
    await store.adminChange('/users/' + id, 'PATCH', { role: value });
  } catch {}
}
async function publishNotice() {
  try {
    await store.adminChange(
      noticeEdit.value ? '/notices/' + noticeEdit.value : '/notices',
      noticeEdit.value ? 'PATCH' : 'POST',
      {
        title: noticeTitle.value.trim(),
        content: noticeContent.value.trim(),
        type: noticeType.value,
        status: noticeStatus.value,
      },
    );
    noticeTitle.value = '';
    noticeContent.value = '';
    noticeEdit.value = '';
  } catch {}
}
async function addCategory() {
  try {
    await store.adminChange(
      categoryEdit.value ? '/categories/' + categoryEdit.value : '/categories',
      categoryEdit.value ? 'PATCH' : 'POST',
      {
        name: categoryName.value.trim(),
        description: categoryDescription.value.trim(),
      },
    );
    categoryName.value = '';
    categoryDescription.value = '';
    categoryEdit.value = '';
  } catch {}
}
async function ruleChange(key: string, event: Event) {
  try {
    await store.adminChange('/point-rules', 'PATCH', {
      code: key,
      amount: Number((event.target as HTMLInputElement).value),
    });
  } catch {}
}
async function pinPost(id: string, key: 'pinned' | 'featured', value: boolean) {
  try {
    await store.adminChange('/posts/' + id, 'PATCH', { [key]: value });
  } catch {}
}
async function pinNotice(id: string, pinned: boolean) {
  try {
    await store.adminChange('/notices/' + id, 'PATCH', { pinned });
  } catch {}
}
const reviewId = ref(''),
  reviewReason = ref('');
async function reviewPost(id: string, approved: boolean) {
  try {
    await store.adminChange('/posts/' + id + '/review', 'POST', {
      approved,
      reason: approved ? '' : reviewReason.value,
    });
    reviewId.value = '';
    reviewReason.value = '';
    await loadAdmin();
  } catch {}
}
const adminStatus = ref(''),
  adminSort = ref('latest'),
  aiStatus = ref('正在检查模型配置');
void api<{ configured: boolean; message: string }>('/ai/status')
  .then((r) => (aiStatus.value = r.configured ? '模型服务已配置' : r.message))
  .catch(() => (aiStatus.value = '暂时无法读取状态'));
const adminPage = ref(1),
  adminTotal = ref(0),
  adminItems = ref<any[]>([]),
  adminError = ref(''),
  adminLoading = ref(false);
const pagedTabs = [
  'users',
  'posts',
  'courses',
  'resources',
  'questions',
  'comments',
  'logs',
  'notices',
];
let sequence = 0;
async function loadAdmin() {
  if (!allowed.value || !pagedTabs.includes(tab.value)) return;
  const n = ++sequence;
  adminLoading.value = true;
  adminError.value = '';
  try {
    const r = await api<{ items: any[]; users: any[]; total: number }>(
      (['comments', 'logs', 'notices'].includes(tab.value) ? '/admin/lists/' : '/admin/catalog/') +
        tab.value +
        '?' +
        new URLSearchParams({
          page: String(adminPage.value),
          q: query.value,
          status: adminStatus.value,
          sort: adminSort.value,
        }),
    );
    if (n !== sequence) return;
    adminItems.value = r.items;
    adminTotal.value = r.total;
    store.hydrate(
      r,
      ['posts', 'questions', 'courses', 'resources'].includes(tab.value)
        ? (tab.value as any)
        : undefined,
    );
  } catch (e) {
    adminError.value = (e as Error).message;
  } finally {
    if (n === sequence) adminLoading.value = false;
  }
}
watch([tab, query, allowed, adminStatus, adminSort], () => {
  if (adminPage.value === 1) void loadAdmin();
  else adminPage.value = 1;
});
watch(adminPage, () => void loadAdmin());
watch(
  () => store.pending,
  (n, old) => {
    if (old > 0 && n === 0) void loadAdmin();
  },
);
</script>
<template>
  <div class="full-page admin-page">
    <div class="page-intro">
      <div>
        <div class="eyebrow">COMMUNITY STUDIO / 社区管理</div>
        <h1>让好的社区，持续发生<span class="title-dot">.</span></h1>
        <p>内容、伙伴与成长，在这里有序连接。</p>
      </div>
      <span class="admin-preview-badge"><Icon name="MonitorPlay" :size="16" />社区管理后台</span>
    </div>
    <div class="preview-info">
      <Icon name="ShieldCheck" :size="21" /><span
        >管理操作由服务端验证权限，并记录操作日志。请谨慎处理内容与用户状态。</span
      >
    </div>
    <section v-if="!allowed" class="panel">
      <EmptyState
        title="请使用管理员账号登录"
        description="当前账号没有管理权限。管理接口会独立验证登录状态与管理员角色。"
        icon="ShieldCheck"
        ><button class="btn btn-primary" @click="store.modal = { type: 'login' }">
          登录管理员账号
        </button></EmptyState
      >
    </section>
    <div v-else class="admin-layout">
      <nav class="panel admin-nav">
        <button
          v-for="t in tabs"
          :key="t.id"
          :class="{ active: tab === t.id }"
          @click="
            tab = t.id;
            query = '';
            adminStatus = '';
          "
        >
          <Icon :name="t.icon" :size="18" />{{ t.label
          }}<span v-if="t.id === 'resources' && stats[3]!.value" class="admin-count">{{
            stats[3]!.value
          }}</span>
        </button>
      </nav>
      <div class="admin-content">
        <template v-if="tab === 'overview'"
          ><div class="admin-stats-grid">
            <div v-for="s in stats" :key="s.label" class="panel admin-stat">
              <div>
                <span>{{ s.label }}</span
                ><strong>{{ s.value }}</strong
                ><small>云数据库实时汇总</small>
              </div>
              <span :class="s.color"><Icon :name="s.icon" :size="23" /></span>
            </div>
          </div>
          <section class="panel">
            <div class="section-head">
              <h2>社区内容趋势</h2>
              <span class="muted small-text">最近 7 天 · 根据创建时间统计</span>
            </div>
            <ActivityChart />
          </section>
          <div class="admin-overview-bottom">
            <section class="panel">
              <h3>今天的社区</h3>
              <div class="admin-today">
                <span
                  >签到人数<strong>{{ store.data.stats?.checkinsToday || 0 }}</strong></span
                ><span
                  >新发帖子<strong>{{
                    store.data.posts.filter((p) => p.createdAt.startsWith(dayKey())).length
                  }}</strong></span
                ><span
                  >新增问题<strong>{{
                    store.data.questions.filter((q) => q.createdAt.startsWith(dayKey())).length
                  }}</strong></span
                ><span
                  >资源总数<strong>{{ store.data.resources.length }}</strong></span
                >
              </div>
            </section>
            <section class="panel">
              <h3>快捷操作</h3>
              <div class="admin-shortcuts">
                <button @click="tab = 'resources'">
                  <Icon name="FolderOpen" :size="21" />审核资源</button
                ><button @click="tab = 'notices'">
                  <Icon name="Megaphone" :size="21" />发布公告</button
                ><button @click="tab = 'users'"><Icon name="Users" :size="21" />管理用户</button>
              </div>
            </section>
          </div></template
        >
        <section v-else class="panel admin-data-panel">
          <div class="section-head">
            <h2>{{ tabs.find((t) => t.id === tab)?.label }}</h2>
            <label v-if="pagedTabs.includes(tab)" class="inline-search"
              ><Icon name="Search" :size="15" /><input
                v-model="query"
                placeholder="输入关键词筛选"
                aria-label="筛选管理内容"
            /></label>
          </div>
          <div
            v-if="['posts', 'resources', 'users', 'courses', 'questions'].includes(tab)"
            class="content-toolbar"
          >
            <label class="field" v-if="['posts', 'resources', 'users'].includes(tab)"
              >状态<select v-model="adminStatus">
                <option value="">全部状态</option>
                <template v-if="tab === 'posts'"
                  ><option value="pending">待审核</option>
                  <option value="published">已发布</option>
                  <option value="rejected">已驳回</option></template
                ><template v-else-if="tab === 'resources'"
                  ><option value="pending">待审核</option>
                  <option value="approved">已通过</option>
                  <option value="rejected">已拒绝</option></template
                ><template v-else
                  ><option value="active">正常</option>
                  <option value="banned">停用</option></template
                >
              </select></label
            ><label class="field"
              >排序<select v-model="adminSort">
                <option value="latest">最新</option>
                <option value="hot">热度 / 积分</option>
              </select></label
            >
          </div>
          <div v-if="tab === 'users'" class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>角色</th>
                  <th>积分</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in filteredUsers" :key="u.id">
                  <td>
                    <div class="table-user">
                      <Avatar :user="u" :size="32" /><span
                        >{{ u.name
                        }}<small>{{
                          u.id === store.currentUser?.id ? '当前账号' : '社区账号'
                        }}</small></span
                      >
                    </div>
                  </td>
                  <td>
                    <select
                      :value="u.role"
                      :disabled="u.id === store.currentUser?.id"
                      aria-label="用户角色"
                      @change="setRole(u.id, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="student">学生</option>
                      <option value="teacher">教师</option>
                      <option value="admin">管理员</option>
                    </select>
                  </td>
                  <td>{{ u.points }}</td>
                  <td>
                    <span class="tag" :class="u.status === 'active' ? 'tag-green' : 'tag-red'">{{
                      u.status === 'active' ? '正常' : '已停用'
                    }}</span>
                  </td>
                  <td>
                    <button
                      class="text-link"
                      :disabled="u.id === store.currentUser?.id"
                      @click="
                        confirm(
                          `${u.status === 'active' ? '停用' : '启用'} ${u.name}？`,
                          '此操作会改变该账号的可用状态，并让已停用账号的登录会话失效。',
                          () => {
                            return store.adminChange('/users/' + u.id, 'PATCH', {
                              status: u.status === 'active' ? 'banned' : 'active',
                            });
                          },
                        )
                      "
                    >
                      {{ u.status === 'active' ? '停用' : '启用' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="tab === 'posts'" class="admin-rows">
            <article v-for="p in adminItems" :key="p.id">
              <div>
                <RouterLink :to="`/forum/${p.id}`"
                  ><strong>{{ p.title }}</strong></RouterLink
                >
                <p>
                  {{ store.user(p.authorId).name }} · {{ p.comments.length }} 条评论 ·
                  {{ timeAgo(p.createdAt) }}
                </p>
                <span class="tag" :class="p.status === 'published' ? 'tag-green' : 'tag-orange'">{{
                  { published: '已发布', pending: '待审核', rejected: '已驳回' }[
                    p.status as 'published'
                  ]
                }}</span>
                <p v-if="p.reviewReason">{{ p.reviewReason }}</p>
                <span v-if="p.pinned" class="tag tag-orange">置顶</span
                ><span v-if="p.featured" class="tag tag-red">精华</span>
              </div>
              <div class="row-actions">
                <button
                  v-if="p.status !== 'published'"
                  class="text-link"
                  @click="reviewPost(p.id, true)"
                >
                  通过审核</button
                ><button
                  v-if="p.status !== 'rejected'"
                  class="text-danger"
                  @click="reviewId = p.id"
                >
                  驳回</button
                ><label v-if="reviewId === p.id" class="field"
                  >驳回原因<input v-model="reviewReason" maxlength="500" /><button
                    class="btn btn-secondary btn-sm"
                    @click="reviewPost(p.id, false)"
                  >
                    确认驳回
                  </button></label
                ><button class="text-link" @click="pinPost(p.id, 'pinned', !p.pinned)">
                  {{ p.pinned ? '取消置顶' : '置顶' }}</button
                ><button class="text-link" @click="pinPost(p.id, 'featured', !p.featured)">
                  {{ p.featured ? '取消精华' : '精华' }}</button
                ><button
                  class="text-danger"
                  @click="confirm('删除帖子？', p.title, () => store.deletePost(p.id))"
                >
                  删除
                </button>
              </div>
            </article>
          </div>
          <div v-else-if="tab === 'comments'" class="admin-rows">
            <article v-for="c in adminItems" :key="c.id">
              <div>
                <strong>{{ c.content }}</strong>
                <p>{{ store.user(c.authorId).name }} · 来自 {{ c.post.title }}</p>
              </div>
              <button
                class="text-danger"
                @click="confirm('删除评论？', c.content, () => store.deleteComment(c.id))"
              >
                删除
              </button>
            </article>
            <EmptyState v-if="!adminItems.length" title="暂时没有评论" />
          </div>
          <div v-else-if="tab === 'courses'" class="admin-rows">
            <button class="btn btn-primary btn-sm" @click="store.modal = { type: 'course' }">
              <Icon name="Plus" :size="15" />创建课程
            </button>
            <article v-for="c in adminItems" :key="c.id">
              <div>
                <RouterLink :to="`/courses/${c.id}`"
                  ><strong>{{ c.title }}</strong></RouterLink
                >
                <p>{{ store.user(c.teacherId).name }} · {{ c.chapters.length }} 个章节</p>
              </div>
              <div class="row-actions">
                <button class="text-link" @click="store.modal = { type: 'course', payload: c }">
                  编辑</button
                ><button
                  class="text-danger"
                  @click="
                    confirm('删除课程？', '课程及相关学习进度将被删除，无法恢复。', () => {
                      return store.adminChange('/courses/' + c.id, 'DELETE');
                    })
                  "
                >
                  删除
                </button>
              </div>
            </article>
          </div>
          <div v-else-if="tab === 'resources'" class="admin-rows">
            <article v-for="r in adminItems" :key="r.id">
              <div>
                <RouterLink :to="`/resources/${r.id}`"
                  ><strong>{{ r.title }}</strong></RouterLink
                >
                <p>{{ store.user(r.authorId).name }} · {{ r.type }} · {{ r.size }}</p>
                <span
                  class="tag"
                  :class="
                    r.status === 'approved'
                      ? 'tag-green'
                      : r.status === 'pending'
                        ? 'tag-orange'
                        : 'tag-red'
                  "
                  >{{
                    { approved: '已通过', pending: '待审核', rejected: '已拒绝' }[
                      r.status as 'approved'
                    ]
                  }}</span
                >
              </div>
              <div class="row-actions">
                <template v-if="r.status === 'pending'"
                  ><button class="text-link" @click="store.approveResource(r, true)">通过</button
                  ><button class="text-danger" @click="store.approveResource(r, false)">
                    拒绝
                  </button></template
                ><button
                  class="text-danger"
                  @click="
                    confirm('删除资源？', r.title, () =>
                      store.adminChange('/resources/' + r.id, 'DELETE'),
                    )
                  "
                >
                  删除
                </button>
              </div>
            </article>
          </div>
          <div v-else-if="tab === 'questions'" class="admin-rows">
            <article v-for="q in adminItems" :key="q.id">
              <div>
                <RouterLink :to="`/questions/${q.id}`"
                  ><strong>{{ q.title }}</strong></RouterLink
                >
                <p>
                  {{ store.user(q.authorId).name }} · {{ q.answers.length }} 个回答 ·
                  {{ q.acceptedId ? '已解决' : '待解决' }}
                </p>
              </div>
              <button class="text-link" @click="store.modal = { type: 'question', payload: q }">
                编辑</button
              ><button
                class="text-danger"
                @click="
                  confirm('删除问题及回答？', q.title, () =>
                    store.adminChange('/questions/' + q.id, 'DELETE'),
                  )
                "
              >
                删除
              </button>
            </article>
          </div>
          <template v-else-if="tab === 'categories'"
            ><form class="admin-category-form" @submit.prevent="addCategory">
              <label class="field"
                >分类名称<input
                  v-model="categoryName"
                  required
                  maxlength="20"
                  placeholder="例如：英语学习" /></label
              ><label class="field"
                >分类描述<input
                  v-model="categoryDescription"
                  maxlength="100"
                  placeholder="一句话介绍这个分区" /></label
              ><button class="btn btn-primary btn-sm">
                {{ categoryEdit ? '保存分类' : '添加分类' }}</button
              ><button
                v-if="categoryEdit"
                type="button"
                class="text-link"
                @click="
                  categoryEdit = '';
                  categoryName = '';
                  categoryDescription = '';
                "
              >
                取消编辑
              </button>
            </form>
            <div class="admin-rows">
              <article v-for="c in store.data.categories" :key="c.id">
                <div>
                  <strong
                    >{{ c.name }}
                    <span v-if="c.enabled === false" class="tag tag-orange">已停用</span></strong
                  ><button
                    class="text-link"
                    @click="
                      categoryEdit = c.id;
                      categoryName = c.name;
                      categoryDescription = c.description;
                    "
                  >
                    编辑
                  </button>
                  <button
                    class="text-link"
                    @click="
                      store.adminChange('/categories/' + c.id, 'PATCH', {
                        enabled: c.enabled === false,
                      })
                    "
                  >
                    {{ c.enabled === false ? '启用' : '停用' }}
                  </button>
                  <p>{{ c.description }}</p>
                </div>
                <button
                  class="text-danger"
                  :disabled="
                    store.data.posts.some((p) => p.category === c.id) ||
                    store.data.courses.some((p) => p.category === c.id) ||
                    store.data.questions.some((p) => p.category === c.id) ||
                    store.data.resources.some((p) => p.category === c.id)
                  "
                  @click="
                    confirm('删除分类？', '只能删除没有关联内容的分类。', () =>
                      store.adminChange('/categories/' + c.id, 'DELETE'),
                    )
                  "
                >
                  删除
                </button>
              </article>
            </div></template
          ><template v-else-if="tab === 'notices'"
            ><form class="notice-editor" @submit.prevent="publishNotice">
              <label class="field"
                >公告标题<input
                  v-model="noticeTitle"
                  required
                  minlength="4"
                  maxlength="100" /></label
              ><label class="field"
                >公告类型<select v-model="noticeType">
                  <option>公告</option>
                  <option>活动</option>
                  <option>更新</option>
                </select></label
              ><label class="field"
                >公告正文<textarea
                  v-model="noticeContent"
                  rows="4"
                  required
                  minlength="10"
                  maxlength="20000"
                  placeholder="支持 Markdown"
                ></textarea></label
              ><label class="field"
                >发布状态<select v-model="noticeStatus">
                  <option value="draft">草稿</option>
                  <option value="published">公开发布</option>
                </select></label
              ><button class="btn btn-primary btn-sm">
                {{ noticeEdit ? '保存公告' : '创建公告' }}</button
              ><button
                v-if="noticeEdit"
                type="button"
                class="text-link"
                @click="
                  noticeEdit = '';
                  noticeTitle = '';
                  noticeContent = '';
                "
              >
                取消编辑
              </button>
            </form>
            <div class="admin-rows">
              <article v-for="n in adminItems" :key="n.id">
                <div>
                  <strong
                    >{{ n.title }}
                    <span class="tag">{{ n.status === 'draft' ? '草稿' : '已发布' }}</span></strong
                  >
                  <p>{{ n.type }} · {{ timeAgo(n.createdAt) }}</p>
                </div>
                <div class="row-actions">
                  <button
                    class="text-link"
                    @click="
                      noticeEdit = n.id;
                      noticeTitle = n.title;
                      noticeContent = n.content;
                      noticeType = n.type;
                      noticeStatus = n.status || 'published';
                    "
                  >
                    编辑</button
                  ><button
                    class="text-link"
                    @click="
                      store.adminChange('/notices/' + n.id, 'PATCH', {
                        status: n.status === 'draft' ? 'published' : 'draft',
                      })
                    "
                  >
                    {{ n.status === 'draft' ? '发布' : '转为草稿' }}</button
                  ><button class="text-link" @click="pinNotice(n.id, !n.pinned)">
                    {{ n.pinned ? '取消置顶' : '置顶' }}</button
                  ><button
                    class="text-danger"
                    @click="
                      confirm('删除公告？', n.title, () =>
                        store.adminChange('/notices/' + n.id, 'DELETE'),
                      )
                    "
                  >
                    删除
                  </button>
                </div>
              </article>
            </div></template
          ><template v-else-if="tab === 'points'"
            ><p class="muted">修改后对新的操作生效，不会重新计算已有积分。</p>
            <div v-for="(value, key) in store.data.pointRules" :key="key" class="settings-row">
              <div>
                <strong>{{
                  {
                    checkin: '每日签到',
                    post: '发布帖子',
                    answer: '回答问题',
                    accepted: '回答被采纳',
                    resource: '资源通过审核',
                  }[key]
                }}</strong>
                <p>奖励成长积分，范围 0—100</p>
              </div>
              <label class="points-input"
                ><input
                  type="number"
                  min="0"
                  max="100"
                  :value="value"
                  :aria-label="key + '积分'"
                  @change="ruleChange(key, $event)"
                />分</label
              >
            </div></template
          ><template v-else-if="tab === 'logs'"
            ><div v-for="log in adminItems" :key="log.id" class="admin-log">
              <span class="log-dot"></span>
              <div>
                <strong>{{ log.action }}</strong>
                <p>
                  {{ store.user(log.actorId).name }} ·
                  {{ new Date(log.createdAt).toLocaleString('zh-CN') }}
                </p>
              </div>
            </div>
            <EmptyState
              v-if="!adminItems.length"
              title="管理操作会记录在这里"
              description="管理操作日志由服务端保存到云数据库。" /></template
          ><template v-else-if="tab === 'config'"
            ><div class="system-info">
              <div><span>当前版本</span><strong>LearnHub 1.0.0</strong></div>
              <div><span>运行模式</span><span class="tag tag-blue">前后端分离</span></div>
              <div><span>数据保存</span><strong>腾讯云 MySQL</strong></div>
              <div><span>数据库</span><span class="muted">learnhub · 独立项目数据库</span></div>
              <div>
                <span>身份认证 / 服务端权限</span
                ><span class="tag tag-orange">服务端会话与角色权限</span>
              </div>
              <div>
                <span>AI 对话接口</span><span class="tag tag-orange">{{ aiStatus }}</span>
              </div>
              <div><span>资源文件大小</span><strong>服务端限制 10 MB</strong></div>
            </div>
            <div class="preview-info">
              <Icon name="LockKeyhole" :size="20" /><span
                >请勿在前端输入或保存 API 密钥、真实密码及其他敏感数据。连接配置由服务端读取。</span
              >
            </div></template
          >
          <p v-if="adminLoading" class="small-empty">正在加载…</p>
          <p v-if="adminError" class="form-error">
            {{ adminError }} <button @click="loadAdmin">重试</button>
          </p>
          <Pagination v-if="pagedTabs.includes(tab)" v-model="adminPage" :total="adminTotal" />
        </section>
      </div>
    </div>
  </div>
</template>
