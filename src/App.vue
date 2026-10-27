<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCommunity } from './stores/community';
import Icon from './components/Icon.vue';
import Avatar from './components/Avatar.vue';
import ModalHost from './components/ModalHost.vue';
import { level } from './services/format';
const store = useCommunity();
const route = useRoute(),
  router = useRouter();
const search = ref(''),
  searchInput = ref<HTMLInputElement>(),
  userMenu = ref(false),
  showNotifications = ref(false);
const topLinks = [
  { label: '首页', path: '/' },
  { label: '论坛', path: '/forum' },
  { label: '课程', path: '/courses' },
  { label: '资源', path: '/resources' },
  { label: '问答', path: '/questions' },
];
const mine = [
  { label: '我的课程', icon: 'BookOpen', path: '/profile?tab=courses' },
  { label: '我的收藏', icon: 'Heart', path: '/profile?tab=favorites' },
  { label: '我的帖子', icon: 'MessageSquare', path: '/profile?tab=posts' },
  { label: '浏览历史', icon: 'Clock3', path: '/profile?tab=history' },
];
const notifications = computed(() =>
  store.data.notifications.filter((n) => n.userId === store.currentUser?.id).slice(0, 4),
);
const active = (path: string) => (path === '/' ? route.path === '/' : route.path.startsWith(path));
function doSearch() {
  if (search.value.trim()) router.push({ path: '/search', query: { q: search.value.trim() } });
}
function shortcut(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchInput.value?.focus();
  }
  if (e.key === 'Escape') {
    userMenu.value = false;
    showNotifications.value = false;
    store.mobileMenu = false;
    store.modal = null;
  }
}
watch(
  () => route.fullPath,
  () => {
    userMenu.value = false;
    showNotifications.value = false;
    store.mobileMenu = false;
    document.title = `${route.meta.title || '学习与成长'} · LearnHub 知学社区`;
    window.scrollTo({ top: 0 });
  },
);
onMounted(() => window.addEventListener('keydown', shortcut));
onUnmounted(() => window.removeEventListener('keydown', shortcut));
</script>
<template>
  <header class="topbar">
    <button
      class="icon-btn mobile-toggle"
      aria-label="打开导航"
      @click="store.mobileMenu = !store.mobileMenu"
    >
      <Icon name="Menu" /></button
    ><RouterLink to="/" class="brand"
      ><span class="brand-mark"
        ><svg viewBox="0 0 40 40" fill="none">
          <path d="M4 7C10 5 15 7 19 10V35C14 31 9 31 4 32V7Z" fill="#6366f1" />
          <path d="M21 10C25 7 30 5 36 7V32C31 31 26 31 21 35V10Z" fill="#448cff" />
          <path d="M9 3C14 3 17 5 19 8V31C16 28 12 27 9 27V3Z" fill="#82a9ff" />
          <path d="M21 8C24 5 28 3 32 3V27C28 27 25 28 21 31V8Z" fill="#5c99ff" /></svg></span
      ><span
        ><strong>LearnHub<span> · 知学社区</span></strong
        ><small>学习 · 交流 · 分享 · 成长</small></span
      ></RouterLink
    >
    <nav class="top-nav" aria-label="主导航">
      <RouterLink
        v-for="item in topLinks"
        :key="item.path"
        :to="item.path"
        :class="{ active: active(item.path) }"
        >{{ item.label }}</RouterLink
      >
    </nav>
    <form class="global-search" @submit.prevent="doSearch">
      <Icon name="Search" :size="18" /><input
        ref="searchInput"
        v-model="search"
        aria-label="全站搜索"
        placeholder="搜索课程、帖子、资源或用户…"
      /><kbd>⌘ K</kbd>
    </form>
    <div class="header-actions">
      <div class="dropdown-anchor">
        <button
          class="icon-btn notification-trigger"
          aria-label="消息通知"
          @click="
            showNotifications = !showNotifications;
            userMenu = false;
          "
        >
          <Icon name="Bell" :size="21" /><span v-if="store.unread" class="notification-badge">{{
            store.unread
          }}</span>
        </button>
        <div v-if="showNotifications" class="dropdown notification-dropdown">
          <div class="dropdown-heading">
            <strong>消息通知</strong
            ><button class="text-link" @click="store.markRead()">全部已读</button>
          </div>
          <RouterLink
            v-for="n in notifications"
            :key="n.id"
            :to="n.link || '/notifications'"
            class="notification-mini"
            @click="store.markRead(n.id)"
            ><span class="mini-notice-icon"
              ><Icon :name="n.type === 'system' ? 'Bell' : 'MessagesSquare'" :size="17" /></span
            ><span
              ><strong>{{ n.title }}</strong
              ><small>{{ n.content }}</small></span
            ><i v-if="!n.read" class="unread-dot"></i
          ></RouterLink>
          <p v-if="!notifications.length" class="dropdown-empty">暂时没有新消息</p>
          <RouterLink to="/notifications" class="dropdown-all"
            >查看全部通知<Icon name="ChevronRight" :size="14"
          /></RouterLink>
        </div>
      </div>
      <button
        class="icon-btn theme-toggle"
        :aria-label="store.theme === 'light' ? '切换深色模式' : '切换浅色模式'"
        @click="store.theme = store.theme === 'light' ? 'dark' : 'light'"
      >
        <Icon :name="store.theme === 'light' ? 'Moon' : 'Sun'" :size="21" />
      </button>
      <div class="dropdown-anchor">
        <button
          class="user-trigger"
          @click="
            userMenu = !userMenu;
            showNotifications = false;
          "
        >
          <Avatar :user="store.currentUser" :size="36" /><span
            v-if="store.currentUser"
            class="header-user"
            ><strong>{{ store.currentUser.name }}</strong
            ><span class="level-badge">Lv.{{ level(store.currentUser.points) }}</span></span
          ><span v-else>登录</span><Icon name="ChevronDown" :size="15" />
        </button>
        <div v-if="userMenu" class="dropdown user-dropdown">
          <div class="dropdown-heading">
            <span>{{ store.currentUser ? '已登录 · 学习同步中' : '欢迎来到知学社区' }}</span>
          </div>
          <RouterLink to="/profile"><Icon name="Users" :size="17" />个人中心</RouterLink
          ><RouterLink to="/profile?tab=settings"
            ><Icon name="Settings" :size="17" />账号设置</RouterLink
          ><RouterLink to="/admin"><Icon name="ShieldCheck" :size="17" />后台管理</RouterLink
          ><button
            @click="
              store.modal = { type: 'login' };
              userMenu = false;
            "
          >
            <Icon name="RotateCcw" :size="17" />登录 / 切换账号</button
          ><button
            v-if="store.currentUser"
            @click="
              store.logout();
              userMenu = false;
            "
          >
            <Icon name="LogOut" :size="17" />退出登录
          </button>
        </div>
      </div>
    </div>
  </header>
  <div
    v-if="userMenu || showNotifications"
    class="dropdown-backdrop"
    @click="
      userMenu = false;
      showNotifications = false;
    "
  ></div>
  <div v-if="store.mobileMenu" class="sidebar-backdrop" @click="store.mobileMenu = false"></div>
  <aside class="sidebar" :class="{ opened: store.mobileMenu }">
    <div class="sidebar-scroll">
      <nav class="side-nav" aria-label="分类导航">
        <RouterLink to="/" :class="{ active: route.path === '/' }"
          ><Icon name="House" />首页</RouterLink
        ><RouterLink to="/categories" :class="{ active: route.path === '/categories' }"
          ><Icon name="LayoutGrid" />全部分类</RouterLink
        ><RouterLink
          v-for="category in store.data.categories.filter((c) => c.enabled !== false)"
          :key="category.id"
          :to="`/forum?category=${category.id}`"
          :class="{ active: route.path === '/forum' && route.query.category === category.id }"
          ><Icon :name="category.icon" />{{ category.name }}</RouterLink
        >
      </nav>
      <div class="sidebar-divider"></div>
      <nav class="side-nav side-personal">
        <RouterLink
          v-for="item in mine"
          :key="item.label"
          :to="item.path"
          :class="{ active: route.fullPath === item.path }"
          ><Icon :name="item.icon" />{{ item.label }}</RouterLink
        >
      </nav>
      <div class="assistant-promo">
        <div class="assistant-promo-copy">
          <h3>
            AI 学习助手<span class="bulb"><Icon name="Sparkles" :size="16" /></span>
          </h3>
          <p>随时为你解答学习中的问题<br />让学习更高效、更有趣！</p>
          <RouterLink to="/ai" class="assistant-button"
            >立即开启对话<Icon name="ArrowRight" :size="17"
          /></RouterLink>
        </div>
        <div class="bot-illustration" aria-hidden="true">
          <div class="bot-halo"></div>
          <div class="bot-orbit"></div>
          <div class="bot-antenna"></div>
          <div class="bot-ear left"></div>
          <div class="bot-ear right"></div>
          <div class="bot-head">
            <div class="bot-face"><i></i><i></i><span>⌣</span></div>
          </div>
          <div class="bot-body"><span></span></div>
          <div class="bot-hand"></div>
          <div class="bot-shadow"></div>
          <i class="bot-sparkle one">✦</i><i class="bot-sparkle two">✦</i>
        </div>
      </div>
      <span class="sidebar-footnote"><span class="status-dot"></span>每一天，都比昨天更进一步</span>
    </div>
  </aside>
  <main class="app-main" :class="{ 'ai-layout': route.path === '/ai' }">
    <RouterView v-if="store.ready" v-slot="{ Component }"
      ><Transition name="page" mode="out-in"
        ><component :is="Component" :key="route.path" /></Transition
    ></RouterView>
    <section v-else class="panel">
      <div class="empty-state">
        <Icon
          :name="store.loadError ? 'CircleAlert' : 'LoaderCircle'"
          :class="{ spin: !store.loadError }"
          :size="32"
        />
        <h3>{{ store.loadError ? '暂时无法读取社区内容' : '正在加载学习社区' }}</h3>
        <p>{{ store.loadError || '正在获取最新的课程、讨论与资源…' }}</p>
        <button v-if="store.loadError" class="btn btn-primary" @click="store.initialize()">
          重新加载
        </button>
      </div>
    </section>
  </main>
  <nav class="mobile-bottom-nav" aria-label="移动导航">
    <RouterLink
      v-for="(item, i) in topLinks"
      :key="item.path"
      :to="item.path"
      :class="{ active: active(item.path) }"
      ><Icon
        :name="['House', 'MessagesSquare', 'BookOpen', 'FolderOpen', 'CircleHelp'][i]!"
        :size="21"
      /><span>{{ item.label }}</span></RouterLink
    >
  </nav>
  <Transition name="toast"
    ><div v-if="store.toast" class="toast-message" :class="store.toast.type" role="status">
      <Icon :name="store.toast.type === 'error' ? 'CircleAlert' : 'CheckCircle2'" :size="20" />{{
        store.toast.text
      }}
    </div></Transition
  ><ModalHost />
</template>
