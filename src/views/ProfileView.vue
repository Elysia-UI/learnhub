<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCommunity } from '../stores/community';
import { level, timeAgo, roleName, date } from '../services/format';
import Pagination from '../components/Pagination.vue';
import Icon from '../components/Icon.vue';
import { api } from '../services/api';
import Avatar from '../components/Avatar.vue';
import CourseCard from '../components/CourseCard.vue';
import PostRow from '../components/PostRow.vue';
import ResourceCard from '../components/ResourceCard.vue';
import EmptyState from '../components/EmptyState.vue';
import FollowButton from '../components/FollowButton.vue';
import { useSocial } from '../stores/social';
import type { ConnectionType } from '../services/social';
const store = useCommunity(),
  social = useSocial(),
  route = useRoute(),
  router = useRouter(),
  favoriteTab = ref('帖子'),
  showPassword = ref(false),
  currentPassword = ref(''),
  newPassword = ref(''),
  passwordError = ref(''),
  passwordBusy = ref(false);
const publicPerson = ref<import('../data/types').User>(),
  memberLoading = ref(false),
  memberError = ref('');
const person = computed(() =>
  route.params.id
    ? publicPerson.value ||
      store.data.users.find((u) => u.id.toLowerCase() === String(route.params.id).toLowerCase())
    : store.currentUser,
);
const self = computed(() => !!person.value && person.value.id === store.currentUser?.id);
const socialSummary = computed(() =>
  person.value ? social.summaries[person.value.id] : undefined,
);
function connectionsPath(type: ConnectionType) {
  return (
    (self.value
      ? '/connections'
      : '/members/' + encodeURIComponent(person.value!.id) + '/connections') +
    '?type=' +
    type
  );
}
const tab = computed(() => String(route.query.tab || 'courses'));
const tabs = [
  { id: 'courses', label: '我的课程', icon: 'BookOpen' },
  { id: 'posts', label: '我的帖子', icon: 'MessageSquare' },
  { id: 'comments', label: '我的评论', icon: 'MessagesSquare' },
  { id: 'questions', label: '我的提问', icon: 'CircleHelp' },
  { id: 'answers', label: '我的回答', icon: 'Pencil' },
  { id: 'resources', label: '我的资源', icon: 'FolderOpen' },
  { id: 'favorites', label: '我的收藏', icon: 'Heart' },
  { id: 'growth', label: '成长记录', icon: 'ChartNoAxesCombined' },
  { id: 'downloads', label: '下载记录', icon: 'Download' },
  { id: 'history', label: '浏览历史', icon: 'Clock3' },
  { id: 'settings', label: '账号设置', icon: 'Settings' },
];
const pageItems = ref<any[]>([]),
  pageTotal = ref(0),
  pageLoading = ref(false),
  pageError = ref(''),
  pages = ref<Record<string, number>>({}),
  growth = ref<any>(null),
  summary = ref<any>({});
const posts = computed(() => (effectiveTab.value === 'posts' ? pageItems.value : [])),
  courses = computed(() => (effectiveTab.value === 'courses' ? pageItems.value : [])),
  teaching = ref<import('../data/types').Course[]>([]),
  questions = computed(() => (effectiveTab.value === 'questions' ? pageItems.value : [])),
  answers = computed(() => (effectiveTab.value === 'answers' ? pageItems.value : [])),
  comments = computed(() => (effectiveTab.value === 'comments' ? pageItems.value : [])),
  resources = computed(() => (effectiveTab.value === 'resources' ? pageItems.value : [])),
  records = computed(() => (effectiveTab.value === 'growth' ? pageItems.value : [])),
  history = computed(() => (effectiveTab.value === 'history' ? pageItems.value : [])),
  favoritePosts = computed(() => pageItems.value),
  favoriteQuestions = computed(() => pageItems.value),
  favoriteResources = computed(() => pageItems.value);
const teachingPage = ref(1),
  teachingTotal = ref(0);
const completedCount = computed(() => growth.value?.stats?.completed || 0);
const activity = computed(() =>
  Array.from({ length: 35 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 34 + i);
    const key = d.toLocaleDateString('sv-SE');
    return {
      key,
      count: Number(growth.value?.activity?.find((a: any) => a.day === key)?.count || 0),
    };
  }),
);
const visibleTabs = computed(() =>
  self.value
    ? tabs
    : tabs.filter((t) => ['posts', 'questions', 'answers', 'resources'].includes(t.id)),
);
const effectiveTab = computed(() =>
  !self.value && !['posts', 'questions', 'answers', 'resources'].includes(tab.value)
    ? 'posts'
    : tab.value,
);
function chooseTab(id: string) {
  router.replace({ path: route.path, query: { tab: id } });
}
const exportScopes = ref(['profile', 'learning', 'points']);
async function exportData() {
  try {
    const exported = await api('/me/export?scopes=' + exportScopes.value.join(','));
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'learnhub-records.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.notify('已按所选范围导出全部个人记录');
  } catch (e) {
    store.notify((e as Error).message, 'error');
  }
}
async function changePassword() {
  passwordError.value = '';
  passwordBusy.value = true;
  try {
    await api('/auth/password', {
      method: 'POST',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value },
    });
    currentPassword.value = '';
    newPassword.value = '';
    await store.initialize();
    store.notify('密码已修改，请重新登录');
    store.modal = { type: 'login' };
  } catch (e) {
    passwordError.value = (e as Error).message;
  } finally {
    passwordBusy.value = false;
  }
}
const pageKey = computed(
    () => (person.value?.id || '') + ':' + effectiveTab.value + ':' + favoriteTab.value,
  ),
  page = computed({
    get: () => pages.value[pageKey.value] || 1,
    set: (n: number) => (pages.value[pageKey.value] = n),
  });
let sequence = 0;
async function loadProfile() {
  const n = ++sequence;
  // A tab must not render rows returned for a different content type.
  pageItems.value = [];
  pageTotal.value = 0;
  if (!person.value) {
    pageLoading.value = false;
    return;
  }
  const subjectId = person.value.id,
    isSelf = self.value,
    subjectRole = person.value.role;
  pageLoading.value = true;
  pageError.value = '';
  try {
    const t = effectiveTab.value,
      kind =
        t === 'favorites'
          ? ({ 帖子: 'posts', 问题: 'questions', 资源: 'resources' } as const)[
              favoriteTab.value as '帖子'
            ]
          : t;
    if (t === 'settings') return;
    const endpoint = isSelf
      ? t === 'courses'
        ? '/me/learning'
        : t === 'favorites'
          ? '/me/favorites/' + kind
          : t === 'growth'
            ? '/me/points'
            : '/me/' + kind
      : '/members/' + encodeURIComponent(subjectId) + '/' + kind;
    const r = await api<{ items: any[]; total: number; users?: any[]; enrollments?: any[] }>(
      endpoint + '?page=' + page.value,
    );
    if (n !== sequence) return;
    pageItems.value = r.items;
    pageTotal.value = r.total;
    const entity = t === 'courses' ? 'courses' : t === 'history' ? 'posts' : kind;
    if (['posts', 'questions', 'courses', 'resources'].includes(entity))
      store.hydrate(r, entity as any);
    else store.hydrate(r);
    if (r.enrollments) store.data.enrollments = r.enrollments;
    if (isSelf) {
      const nextGrowth = await api('/me/growth');
      if (n !== sequence) return;
      growth.value = nextGrowth;
      if (['teacher', 'admin'].includes(subjectRole)) {
        const taught = await api<{ items: any[]; total: number }>(
          '/me/courses?page=' + teachingPage.value,
        );
        if (n !== sequence) return;
        teaching.value = taught.items;
        teachingTotal.value = taught.total;
      }
    }
  } catch (e) {
    if (n === sequence) pageError.value = (e as Error).message;
  } finally {
    if (n === sequence) pageLoading.value = false;
  }
}
watch(
  [
    effectiveTab,
    favoriteTab,
    page,
    teachingPage,
    () => person.value?.id,
    self,
    () => store.currentUser?.id,
  ],
  () => void loadProfile(),
  {
    immediate: true,
  },
);
watch(
  () => store.pending,
  (n, old) => {
    if (old > 0 && n === 0) void loadProfile();
  },
);
let memberSequence = 0,
  memberController: AbortController | undefined;
async function loadMember() {
  const id = String(route.params.id || ''),
    n = ++memberSequence;
  memberController?.abort();
  const controller = new AbortController();
  memberController = controller;
  publicPerson.value = undefined;
  summary.value = {};
  growth.value = null;
  teaching.value = [];
  teachingTotal.value = 0;
  memberError.value = '';
  memberLoading.value = !!id;
  if (!id) return;
  try {
    const user = await api<import('../data/types').User & { stats: any }>(
      '/members/' + encodeURIComponent(id),
      { signal: controller.signal },
    );
    if (n !== memberSequence || controller.signal.aborted) return;
    publicPerson.value = user;
    store.hydrate({ users: [user] });
    summary.value = user.stats;
  } catch (e) {
    if (n === memberSequence && !controller.signal.aborted)
      memberError.value = (e as Error).message;
  } finally {
    if (n === memberSequence) memberLoading.value = false;
  }
}
watch(
  () => route.params.id,
  () => void loadMember(),
  { immediate: true },
);
watch(
  [() => person.value?.id, () => store.currentUser?.id],
  ([id]) => {
    if (id) void social.loadSummary(id, true);
  },
  { immediate: true },
);
onUnmounted(() => {
  memberController?.abort();
  memberSequence++;
  sequence++;
});
</script>
<template>
  <div v-if="person" class="full-page profile-page">
    <section class="panel profile-cover">
      <div class="profile-cover-pattern">
        <span></span><i>Keep learning. Keep growing.</i><Icon name="Sparkles" :size="44" />
      </div>
      <div class="profile-info">
        <Avatar :user="person" :size="88" />
        <div class="profile-name">
          <h1>
            {{ person.name }}<span class="level-badge">Lv.{{ level(person.points) }}</span
            ><span class="tag tag-purple">{{ roleName(person.role) }}</span>
          </h1>
          <p>{{ person.bio || '还没有填写简介，来记录你的学习故事吧。' }}</p>
          <span
            ><Icon name="CalendarDays" :size="14" />加入于
            {{ new Date(person.joined).toLocaleDateString('zh-CN') }}</span
          >
        </div>
        <button v-if="self" class="btn btn-secondary" @click="store.modal = { type: 'profile' }">
          <Icon name="Pencil" :size="16" />编辑资料
        </button>
        <div v-else class="profile-social-actions">
          <RouterLink
            v-if="socialSummary?.isFriend"
            :to="'/messages/' + person.id"
            class="btn btn-secondary btn-sm"
            ><Icon name="MessageSquare" :size="15" />发消息</RouterLink
          >
          <FollowButton :user-id="person.id" /><RouterLink
            :to="`/search?q=${encodeURIComponent(person.name)}`"
            class="text-link"
            >更多关于 TA<Icon name="ArrowRight" :size="13"
          /></RouterLink>
        </div>
      </div>
      <nav class="profile-social" aria-label="关注与粉丝">
        <RouterLink :to="connectionsPath('following')"
          ><strong>{{ socialSummary?.followingCount ?? '—' }}</strong
          ><span>关注</span><Icon name="ChevronRight" :size="13"
        /></RouterLink>
        <RouterLink :to="connectionsPath('followers')"
          ><strong>{{ socialSummary?.followersCount ?? '—' }}</strong
          ><span>粉丝</span><Icon name="ChevronRight" :size="13"
        /></RouterLink>
        <RouterLink v-if="self" :to="connectionsPath('friends')"
          ><strong>{{ socialSummary?.friendsCount ?? '—' }}</strong
          ><span>互关好友</span><Icon name="ChevronRight" :size="13"
        /></RouterLink>
        <span v-else-if="socialSummary?.isFriend" class="profile-friend-label"
          ><Icon name="Users" :size="14" />你们已是互关好友</span
        >
        <span v-else-if="socialSummary?.followsYou" class="profile-friend-label">TA 关注了你</span>
        <RouterLink v-if="self" to="/forum?scope=following" class="social-feed-link"
          >关注动态<Icon name="ArrowRight" :size="14"
        /></RouterLink>
      </nav>
      <p v-if="social.errors[person.id]" class="profile-social-error" role="alert">
        {{ social.errors[person.id] }}
        <button class="text-link" @click="social.loadSummary(person.id, true)">
          重新读取关注信息
        </button>
      </p>
      <div class="profile-stats">
        <div>
          <strong>{{ person.points }}</strong
          ><span>成长积分</span>
        </div>
        <div>
          <strong>{{ growth?.stats?.posts ?? summary.posts ?? posts.length }}</strong
          ><span>发表帖子</span>
        </div>
        <div>
          <strong>{{ growth?.stats?.likes ?? summary.likes ?? 0 }}</strong
          ><span>收获点赞</span>
        </div>
        <div v-if="self">
          <strong>{{ completedCount }}</strong
          ><span>完成章节</span>
        </div>
        <div v-if="self">
          <button
            class="btn"
            :class="store.checkedToday ? 'btn-secondary' : 'btn-primary'"
            :disabled="store.checkedToday"
            @click="store.checkin"
          >
            <Icon :name="store.checkedToday ? 'CheckCircle2' : 'CalendarDays'" :size="17" />{{
              store.checkedToday ? '今日已签到' : `每日签到 +${store.data.pointRules.checkin}`
            }}
          </button>
        </div>
      </div>
    </section>
    <div class="profile-layout">
      <aside class="panel profile-nav">
        <button
          v-for="t in visibleTabs"
          :key="t.id"
          :class="{ active: effectiveTab === t.id }"
          @click="chooseTab(t.id)"
        >
          <Icon :name="t.icon" :size="18" />{{ self ? t.label : t.label.replace('我的', 'TA 的') }}
        </button>
      </aside>
      <section class="panel profile-content">
        <div class="section-head">
          <h2>
            {{
              visibleTabs
                .find((t) => t.id === effectiveTab)
                ?.label.replace('我的', self ? '我的' : 'TA 的')
            }}
          </h2>
          <RouterLink v-if="effectiveTab === 'posts' && self" class="text-link" to="/forum/new"
            ><Icon name="Plus" :size="16" />发布帖子</RouterLink
          >
        </div>
        <p v-if="pageLoading" class="small-empty" role="status">正在读取个人记录…</p>
        <p v-else-if="pageError" class="form-error">
          {{ pageError }} <button class="text-link" @click="loadProfile">重试</button>
        </p>
        <template v-else
          ><template v-if="effectiveTab === 'courses'"
            ><div v-if="courses.length" class="my-courses">
              <div v-for="course in courses" :key="course.id" class="my-course">
                <CourseCard :course="course" />
                <div>
                  <p>
                    <span>学习进度</span
                    ><strong
                      >{{
                        Math.round(
                          ((store.progress(course.id)?.completed.length || 0) /
                            course.chapters.length) *
                            100,
                        )
                      }}%</strong
                    >
                  </p>
                  <div class="progress-bar">
                    <i
                      :style="{
                        width:
                          ((store.progress(course.id)?.completed.length || 0) /
                            course.chapters.length) *
                            100 +
                          '%',
                      }"
                    ></i>
                  </div>
                  <RouterLink :to="`/courses/${course.id}`" class="text-link"
                    >继续学习<Icon name="ArrowRight" :size="15"
                  /></RouterLink>
                </div>
              </div>
            </div>
            <EmptyState
              v-else
              title="学习之旅，从一门好课开始"
              description="选择你感兴趣的课程，按照自己的节奏成长。"
              ><RouterLink to="/courses" class="btn btn-primary">发现好课程</RouterLink></EmptyState
            ><template v-if="['teacher', 'admin'].includes(person.role)"
              ><div class="section-head teaching-heading">
                <h2>我发布的课程</h2>
                <button class="text-link" @click="store.modal = { type: 'course' }">
                  <Icon name="Plus" :size="15" />创建课程
                </button>
              </div>
              <Pagination v-model="teachingPage" :total="teachingTotal" />
              <div class="teaching-list">
                <div v-for="course in teaching" :key="course.id">
                  <RouterLink :to="`/courses/${course.id}`"
                    >{{ course.title }}<small>{{ course.chapters.length }} 章节</small></RouterLink
                  ><button
                    class="btn btn-secondary btn-sm"
                    @click="store.modal = { type: 'course', payload: course }"
                  >
                    管理
                  </button>
                </div>
              </div></template
            ></template
          ><template v-else-if="effectiveTab === 'posts'"
            ><PostRow v-for="post in posts" :key="post.id" :post="post" /><EmptyState
              v-if="!posts.length"
              title="还没有发表帖子"
              description="每一份真实经验，都值得被分享。" /></template
          ><template v-else-if="effectiveTab === 'comments'"
            ><RouterLink
              v-for="c in comments"
              :key="c.id"
              :to="`/forum/${c.post.id}`"
              class="profile-record"
              ><span class="tag tag-blue">评论</span>
              <div>
                <strong>{{ c.content }}</strong>
                <p>来自：{{ c.post.title }}</p>
              </div>
              <time>{{ timeAgo(c.createdAt) }}</time></RouterLink
            ><EmptyState v-if="!comments.length" title="还没有留下评论" /></template
          ><template v-else-if="effectiveTab === 'questions'"
            ><RouterLink
              v-for="q in questions"
              :key="q.id"
              :to="`/questions/${q.id}`"
              class="profile-record"
              ><span class="tag" :class="q.acceptedId ? 'tag-green' : 'tag-orange'">{{
                q.acceptedId ? '已解决' : '待解决'
              }}</span>
              <div>
                <strong>{{ q.title }}</strong>
                <p>{{ q.answers.length }} 个回答</p>
              </div>
              <Icon name="ChevronRight" :size="17" /></RouterLink
            ><EmptyState v-if="!questions.length" title="还没有提出问题" /></template
          ><template v-else-if="effectiveTab === 'answers'"
            ><RouterLink
              v-for="a in answers"
              :key="a.id"
              :to="`/questions/${a.question.id}`"
              class="profile-record"
              ><span
                class="tag"
                :class="a.question.acceptedId === a.id ? 'tag-green' : 'tag-blue'"
                >{{ a.question.acceptedId === a.id ? '已采纳' : '回答' }}</span
              >
              <div>
                <strong>{{ a.question.title }}</strong>
                <p>{{ a.content.slice(0, 80) }}</p>
              </div></RouterLink
            ><EmptyState
              v-if="!answers.length"
              title="还没有回答问题"
              description="也许你的经验，正是别人寻找的答案。" /></template
          ><template v-else-if="effectiveTab === 'resources'"
            ><div v-for="r in resources" :key="r.id" class="my-resource">
              <ResourceCard :resource="r" /><span
                class="tag"
                :class="
                  r.status === 'approved'
                    ? 'tag-green'
                    : r.status === 'pending'
                      ? 'tag-orange'
                      : 'tag-red'
                "
                >{{
                  { approved: '已公开', pending: '待审核', rejected: '未通过' }[
                    r.status as 'approved'
                  ]
                }}</span
              >
            </div>
            <EmptyState
              v-if="!resources.length"
              title="分享你的第一份资源"
              description="让认真整理的知识，被更多人看见。" /></template
          ><template v-else-if="effectiveTab === 'favorites'"
            ><div class="category-pills small">
              <button
                v-for="f in ['帖子', '问题', '资源']"
                :key="f"
                :class="{ active: favoriteTab === f }"
                @click="favoriteTab = f"
              >
                {{ f }}
              </button>
            </div>
            <template v-if="favoriteTab === '帖子'"
              ><PostRow v-for="post in favoritePosts" :key="post.id" :post="post" /><EmptyState
                v-if="!favoritePosts.length"
                title="还没有收藏帖子" /></template
            ><template v-else-if="favoriteTab === '问题'"
              ><RouterLink
                v-for="q in favoriteQuestions"
                :key="q.id"
                :to="`/questions/${q.id}`"
                class="profile-record"
                ><Icon name="CircleHelp" :size="22" /><strong>{{ q.title }}</strong
                ><Icon name="ChevronRight" :size="17" /></RouterLink
              ><EmptyState v-if="!favoriteQuestions.length" title="还没有收藏问题" /></template
            ><template v-else
              ><ResourceCard v-for="r in favoriteResources" :key="r.id" :resource="r" /><EmptyState
                v-if="!favoriteResources.length"
                title="还没有收藏资源" /></template></template
          ><template v-else-if="effectiveTab === 'growth'"
            ><div class="growth-overview">
              <div>
                <Icon name="Award" :size="31" /><strong>Lv.{{ level(person.points) }}</strong
                ><span>持续成长的学习者</span>
              </div>
              <div>
                <p>距离下一级还需 {{ 30 - (person.points % 30) }} 积分</p>
                <div class="progress-bar">
                  <i :style="{ width: ((person.points % 30) / 30) * 100 + '%' }"></i>
                </div>
                <small>签到、分享和帮助他人，都能让你成长。</small>
              </div>
            </div>
            <h3 class="subheading">最近 35 天的社区活动</h3>
            <div class="activity-grid">
              <i
                v-for="a in activity"
                :key="a.key"
                :title="`${a.key}：${a.count} 次活动`"
                :class="{ active: a.count > 0, more: a.count > 1 }"
              ></i>
            </div>
            <div class="activity-legend">
              更少<i></i><i class="active"></i><i class="more"></i>更多
            </div>
            <h3 class="subheading">成就徽章</h3>
            <div class="badge-collection">
              <div v-for="b in growth?.badges || []" :key="b.name" class="unlocked">
                <Icon name="Award" :size="26" /><strong>{{ b.name }}</strong
                ><small>{{ date(b.earnedAt) }}</small>
              </div>
              <p v-if="!growth?.badges?.length" class="muted">
                继续学习和分享，解锁你的第一枚徽章。
              </p>
            </div>
            <h3 class="subheading">积分明细</h3>
            <div v-for="p in records" :key="p.id" class="points-record">
              <span
                >{{ p.reason }}<small>{{ timeAgo(p.createdAt) }}</small></span
              ><strong>{{ p.amount > 0 ? '+' : '' }}{{ p.amount }}</strong>
            </div>
            <p v-if="!records.length" class="small-empty">
              操作产生的积分记录会出现在这里。初始演示积分来自数据库中的关联积分记录。
            </p>
            <h3 class="subheading">签到记录</h3>
            <div class="checkin-dates">
              <span
                v-for="c in store.data.checkins.filter((c) => c.userId === person!.id)"
                :key="c.date"
                ><Icon name="CheckCircle2" :size="15" />{{ c.date }}</span
              >
              <p v-if="!store.data.checkins.some((c) => c.userId === person!.id)" class="muted">
                还没有签到记录，今天开始吧。
              </p>
            </div></template
          ><template v-else-if="effectiveTab === 'history'"
            ><PostRow v-for="post in history" :key="post.id" :post="post" /><EmptyState
              v-if="!history.length"
              title="从一次好奇的点击开始"
              description="你看过的帖子会记录在这里。" /></template
          ><template v-else-if="effectiveTab === 'downloads'"
            ><RouterLink
              v-for="d in pageItems"
              :key="d.id"
              :to="'/resources/' + d.resourceId"
              class="profile-record"
              ><Icon name="Download" :size="22" /><strong>{{ d.title }}</strong
              ><time>{{ timeAgo(d.createdAt) }}</time></RouterLink
            ><EmptyState v-if="!pageItems.length" title="还没有下载记录" /></template
          ><template v-else-if="effectiveTab === 'settings'"
            ><div class="settings-row">
              <div>
                <strong>个人资料</strong>
                <p>修改昵称、头像和个人介绍</p>
              </div>
              <button class="btn btn-secondary btn-sm" @click="store.modal = { type: 'profile' }">
                编辑资料
              </button>
            </div>
            <div class="settings-row">
              <div>
                <strong>外观主题</strong>
                <p>选择舒服的阅读体验</p>
              </div>
              <button
                class="btn btn-secondary btn-sm"
                @click="store.theme = store.theme === 'light' ? 'dark' : 'light'"
              >
                <Icon :name="store.theme === 'light' ? 'Moon' : 'Sun'" :size="16" />{{
                  store.theme === 'light' ? '深色模式' : '浅色模式'
                }}
              </button>
            </div>
            <div class="settings-row">
              <div>
                <strong>登录账号</strong>
                <p>使用你的邮箱与密码登录其他账号</p>
              </div>
              <button class="btn btn-secondary btn-sm" @click="store.modal = { type: 'login' }">
                切换账号
              </button>
            </div>
            <div class="settings-row">
              <div>
                <strong>导出学习记录</strong>
                <p>按勾选范围导出你的全部数据库记录</p>
                <div class="category-pills">
                  <label
                    v-for="(label, key) in {
                      profile: '个人资料',
                      posts: '帖子',
                      questions: '问题',
                      resources: '资源',
                      learning: '课程和进度',
                      favorites: '收藏',
                      points: '积分',
                      downloads: '下载',
                    }"
                    :key="key"
                    ><input v-model="exportScopes" type="checkbox" :value="key" />{{ label }}</label
                  >
                </div>
                <p></p>
              </div>
              <button class="btn btn-secondary btn-sm" @click="exportData">
                <Icon name="Download" :size="15" />导出数据
              </button>
            </div>
            <div class="settings-row">
              <div>
                <strong>登录密码</strong>
                <p>修改后需要重新登录，所有旧会话都会失效</p>
              </div>
              <button class="btn btn-secondary btn-sm" @click="showPassword = !showPassword">
                修改密码
              </button>
            </div>
            <form v-if="showPassword" @submit.prevent="changePassword" style="padding-top: 20px">
              <label class="field"
                >当前密码<input
                  v-model="currentPassword"
                  type="password"
                  required
                  autocomplete="current-password" /></label
              ><label class="field"
                >新密码<input
                  v-model="newPassword"
                  type="password"
                  required
                  minlength="12"
                  maxlength="128"
                  autocomplete="new-password"
                  placeholder="至少 12 位，包含字母和数字"
              /></label>
              <p v-if="passwordError" class="form-error">{{ passwordError }}</p>
              <button class="btn btn-primary" :disabled="passwordBusy">确认修改密码</button>
            </form>
            <div class="preview-info">
              <Icon name="LockKeyhole" :size="20" /><span
                >账号通过真实登录与服务端会话保护，学习与交流记录已保存在云数据库。</span
              >
            </div></template
          >
          <Pagination v-if="effectiveTab !== 'settings'" v-model="page" :total="pageTotal"
        /></template>
      </section>
    </div>
  </div>
  <section v-else class="panel">
    <EmptyState
      v-if="route.params.id"
      :title="memberLoading ? '正在读取用户主页…' : '暂时无法打开用户主页'"
      :description="memberError || '请稍候，正在从社区读取最新资料。'"
      ><button v-if="!memberLoading" class="btn btn-secondary" @click="loadMember">
        重新读取
      </button></EmptyState
    >
    <EmptyState
      v-else
      title="先认识一下彼此吧"
      description="登录或注册账号，继续属于自己的学习旅程。"
      ><button class="btn btn-primary" @click="store.modal = { type: 'login' }">
        进入知学社区
      </button></EmptyState
    >
  </section>
</template>

<style scoped>
.profile-social-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  margin-top: 30px;
}
.profile-social {
  display: flex;
  align-items: center;
  gap: 10px 26px;
  flex-wrap: wrap;
  padding: 13px 17px;
  margin: 0 30px 18px;
  background: var(--soft);
  border-radius: 10px;
}
.profile-social > a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--subtle);
}
.profile-social > a strong {
  font-size: 19px;
  font-weight: 650;
  color: var(--text);
}
.profile-social > a svg {
  color: var(--muted);
}
.profile-social > a:hover,
.profile-social > a:hover strong {
  color: var(--primary);
}
.profile-social .social-feed-link {
  margin-left: auto;
  color: var(--primary);
}
.profile-friend-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--primary);
}
.profile-social-error {
  margin: 0 30px 16px;
  color: #e35572;
  font-size: 12px;
}
@media (max-width: 700px) {
  .profile-social-actions {
    margin: 0 0 0 87px;
    align-items: flex-start;
  }
  .profile-social {
    margin: 0 18px 16px;
    gap: 14px 18px;
    padding: 12px;
  }
  .profile-social > a {
    font-size: 11px;
    gap: 5px;
  }
  .profile-social > a strong {
    font-size: 18px;
  }
  .profile-social .social-feed-link {
    margin-left: 0;
  }
  .profile-social-error {
    margin: 0 18px 16px;
  }
}
</style>
