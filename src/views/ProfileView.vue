<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCommunity } from '../stores/community';
import { level, timeAgo, roleName, date } from '../services/format';
import Icon from '../components/Icon.vue';
import { api } from '../services/api';
import Avatar from '../components/Avatar.vue';
import CourseCard from '../components/CourseCard.vue';
import PostRow from '../components/PostRow.vue';
import ResourceCard from '../components/ResourceCard.vue';
import EmptyState from '../components/EmptyState.vue';
const store = useCommunity(),
  route = useRoute(),
  router = useRouter(),
  favoriteTab = ref('帖子'),
  showPassword = ref(false),
  currentPassword = ref(''),
  newPassword = ref(''),
  passwordError = ref(''),
  passwordBusy = ref(false);
const person = computed(() =>
  route.params.id ? store.data.users.find((u) => u.id === route.params.id) : store.currentUser,
);
const self = computed(() => person.value?.id === store.currentUser?.id);
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
  { id: 'history', label: '浏览历史', icon: 'Clock3' },
  { id: 'settings', label: '账号设置', icon: 'Settings' },
];
const posts = computed(() => store.data.posts.filter((p) => p.authorId === person.value?.id));
const courses = computed(() =>
  store.data.courses.filter((c) =>
    store.data.enrollments.some((e) => e.courseId === c.id && e.userId === person.value?.id),
  ),
);
const teaching = computed(() => store.data.courses.filter((c) => c.teacherId === person.value?.id));
const questions = computed(() =>
  store.data.questions.filter((q) => q.authorId === person.value?.id),
);
const answers = computed(() =>
  store.data.questions.flatMap((q) =>
    q.answers.filter((a) => a.authorId === person.value?.id).map((a) => ({ ...a, question: q })),
  ),
);
const comments = computed(() =>
  store.data.posts.flatMap((p) =>
    p.comments.filter((c) => c.authorId === person.value?.id).map((c) => ({ ...c, post: p })),
  ),
);
const resources = computed(() =>
  store.data.resources.filter(
    (r) => r.authorId === person.value?.id && (self.value || r.status === 'approved'),
  ),
);
const records = computed(() => store.data.points.filter((p) => p.userId === person.value?.id));
const activity = computed(() =>
  Array.from({ length: 35 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 34 + i);
    const key = d.toLocaleDateString('sv-SE');
    const count =
      posts.value.filter((p) => p.createdAt.startsWith(key)).length +
      answers.value.filter((a) => a.createdAt.startsWith(key)).length +
      store.data.checkins.filter((c) => c.userId === person.value?.id && c.date === key).length;
    return { key, count };
  }),
);
const history = computed(() =>
  store.data.history
    .filter((h) => h.userId === person.value?.id)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .map((h) => store.data.posts.find((p) => p.id === h.postId))
    .filter((p) => !!p),
);
const favoritePosts = computed(() =>
  store.data.posts.filter((p) => p.favorites.includes(person.value?.id || '')),
);
const favoriteQuestions = computed(() =>
  store.data.questions.filter((q) => q.favorites.includes(person.value?.id || '')),
);
const favoriteResources = computed(() =>
  store.data.resources.filter((r) => r.favorites.includes(person.value?.id || '')),
);
const completedCount = computed(() =>
  store.data.enrollments
    .filter((e) => e.userId === person.value?.id)
    .reduce((sum, e) => sum + e.completed.length, 0),
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
function exportData() {
  const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' }),
    url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'learnhub-records.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  store.notify('已导出当前学习记录');
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
          <Icon name="Pencil" :size="16" />编辑资料</button
        ><RouterLink
          v-else
          :to="`/search?q=${encodeURIComponent(person.name)}`"
          class="btn btn-secondary"
          >更多关于 TA</RouterLink
        >
      </div>
      <div class="profile-stats">
        <div>
          <strong>{{ person.points }}</strong
          ><span>成长积分</span>
        </div>
        <div>
          <strong>{{ posts.length }}</strong
          ><span>发表帖子</span>
        </div>
        <div>
          <strong>{{ posts.reduce((sum, p) => sum + p.likes.length, 0) }}</strong
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
        <template v-if="effectiveTab === 'courses'"
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
            ><span class="tag" :class="a.question.acceptedId === a.id ? 'tag-green' : 'tag-blue'">{{
              a.question.acceptedId === a.id ? '已采纳' : '回答'
            }}</span>
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
              >{{ { approved: '已公开', pending: '待审核', rejected: '未通过' }[r.status] }}</span
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
            <div :class="{ unlocked: posts.length > 0 }">
              <Icon name="Pencil" :size="26" /><strong>初次分享</strong
              ><small>发表第一篇帖子</small>
            </div>
            <div :class="{ unlocked: completedCount > 0 }">
              <Icon name="BookOpen" :size="26" /><strong>学有所获</strong
              ><small>完成第一个章节</small>
            </div>
            <div :class="{ unlocked: answers.some((a) => a.id === a.question.acceptedId) }">
              <Icon name="Heart" :size="26" /><strong>助人为乐</strong><small>回答被采纳</small>
            </div>
          </div>
          <h3 class="subheading">积分明细</h3>
          <div v-for="p in records" :key="p.id" class="points-record">
            <span
              >{{ p.reason }}<small>{{ timeAgo(p.createdAt) }}</small></span
            ><strong>+{{ p.amount }}</strong>
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
              <p>导出当前已读取的社区和学习记录</p>
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
      </section>
    </div>
  </div>
  <section v-else class="panel">
    <EmptyState title="先认识一下彼此吧" description="登录或注册账号，继续属于自己的学习旅程。"
      ><button class="btn btn-primary" @click="store.modal = { type: 'login' }">
        进入知学社区
      </button></EmptyState
    >
  </section>
</template>
