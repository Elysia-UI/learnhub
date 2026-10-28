<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCommunity } from '../stores/community';
import Icon from '../components/Icon.vue';
import { api } from '../services/api';
import PostRow from '../components/PostRow.vue';
import RightRail from '../components/RightRail.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
const store = useCommunity(),
  route = useRoute(),
  router = useRouter(),
  sort = ref('最新'),
  keyword = ref(''),
  page = ref(1);
const category = computed(() => String(route.query.category || 'all'));
const following = computed(() => route.query.scope === 'following');
const currentCategory = computed(() => store.category(category.value));
const posts = ref<import('../data/types').Post[]>([]),
  total = ref(0),
  listLoading = ref(false),
  listError = ref('');
let requestNo = 0;
async function fetchPosts() {
  const number = ++requestNo;
  listLoading.value = true;
  listError.value = '';
  posts.value = [];
  total.value = 0;
  if (following.value && !store.currentUser) {
    listLoading.value = false;
    return;
  }
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: '8',
      q: keyword.value,
      category: category.value,
      sort: sort.value === '最热' ? 'hot' : sort.value === '精华' ? 'featured' : 'latest',
    });
    if (following.value) params.set('scope', 'following');
    const result = await api<{
      items: import('../data/types').Post[];
      users: any[];
      total: number;
    }>('/posts?' + params);
    if (number === requestNo) {
      posts.value = result.items;
      total.value = result.total;
      store.hydrate(result, 'posts');
    }
  } catch (e) {
    if (number === requestNo) listError.value = (e as Error).message;
  } finally {
    if (number === requestNo) listLoading.value = false;
  }
}
function chooseScope(value: boolean) {
  void router.push({
    path: '/forum',
    query: { ...route.query, scope: value ? 'following' : undefined },
  });
}
function chooseCategory(id: string) {
  void router.push({
    path: '/forum',
    query: { ...route.query, category: id === 'all' ? undefined : id },
  });
}
watch([category, sort, keyword, following, () => store.currentUser?.id], () => {
  if (page.value === 1) void fetchPosts();
  else page.value = 1;
});
watch(page, () => void fetchPosts());
void fetchPosts();
</script>
<template>
  <div class="page-grid">
    <div class="main-column">
      <div class="page-intro">
        <div>
          <div class="eyebrow">COMMUNITY / 交流论坛</div>
          <h1>
            {{ currentCategory?.name || '在交流中，一起成长' }}<span class="title-dot">.</span>
          </h1>
          <p>
            {{ currentCategory?.description || '分享所学，交流所想。每一个声音，都值得被听见。' }}
          </p>
        </div>
        <RouterLink to="/forum/new" class="btn btn-primary"
          ><Icon name="Pencil" :size="17" />发布帖子</RouterLink
        >
      </div>
      <nav class="forum-feed-scope" aria-label="讨论来源">
        <button
          :class="{ active: !following }"
          :aria-pressed="!following"
          @click="chooseScope(false)"
        >
          <Icon name="MessagesSquare" :size="17" />发现讨论
        </button>
        <button :class="{ active: following }" :aria-pressed="following" @click="chooseScope(true)">
          <Icon name="Users" :size="17" />关注动态
        </button>
        <RouterLink v-if="store.currentUser" to="/connections" class="text-link"
          >管理关注<Icon name="ArrowUpRight" :size="14"
        /></RouterLink>
      </nav>
      <div class="category-pills">
        <button :class="{ active: category === 'all' }" @click="chooseCategory('all')">
          全部讨论</button
        ><button
          v-for="c in store.data.categories.filter((c) => c.enabled !== false)"
          :key="c.id"
          :class="{ active: category === c.id }"
          @click="chooseCategory(c.id)"
        >
          {{ c.name }}
        </button>
      </div>
      <section class="panel forum-panel">
        <div class="list-toolbar">
          <div class="line-tabs">
            <button
              v-for="s in ['最新', '最热', '精华']"
              :key="s"
              :class="{ active: sort === s }"
              @click="sort = s"
            >
              {{ s === '最新' ? '最新发布' : s === '最热' ? '热门讨论' : '精选内容' }}
            </button>
          </div>
          <label class="inline-search"
            ><Icon name="Search" :size="16" /><input
              v-model="keyword"
              aria-label="搜索帖子"
              placeholder="搜索帖子"
          /></label>
        </div>
        <p v-if="listLoading" class="small-empty">正在读取最新讨论…</p>
        <div v-if="listError" class="form-error">
          {{ listError }}<button class="text-link" @click="fetchPosts">重试</button>
        </div>
        <EmptyState
          v-if="following && !store.currentUser"
          title="登录后查看关注动态"
          description="关注感兴趣的学习伙伴，他们的新帖子会出现在这里。"
          icon="Users"
        >
          <button class="btn btn-primary" @click="store.requireUser()">登录社区</button>
        </EmptyState>
        <PostRow v-for="post in posts" :key="post.id" :post="post" /><EmptyState
          v-if="!listLoading && !listError && !posts.length && (!following || store.currentUser)"
          :title="following ? '这里还没有关注动态' : '暂时没有相关讨论'"
          :description="
            following
              ? '关注你感兴趣的作者后，他们公开发布的帖子会出现在这里；也可以调整分类和关键词。'
              : '换个关键词试试，或成为第一个分享的人。'
          "
          ><RouterLink v-if="following" to="/leaderboard" class="btn btn-primary"
            >发现学习伙伴</RouterLink
          ><RouterLink v-else to="/forum/new" class="btn btn-primary"
            >发布新帖</RouterLink
          ></EmptyState
        ><Pagination v-model="page" :total="total" />
      </section>
      <div class="list-end" v-if="total > 0 && total <= 8">
        <span></span>每一次交流，都是成长的开始<span></span>
      </div>
    </div>
    <RightRail />
  </div>
</template>

<style scoped>
.forum-feed-scope {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -4px 0 18px;
}
.forum-feed-scope > button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  color: var(--subtle);
  font-weight: 600;
}
.forum-feed-scope > button.active {
  color: var(--primary);
  background: var(--hover);
  border-color: var(--primary);
}
.forum-feed-scope > a {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  white-space: nowrap;
}
@media (max-width: 480px) {
  .forum-feed-scope {
    gap: 6px;
  }
  .forum-feed-scope > button {
    padding: 9px 10px;
    font-size: 12px;
  }
  .forum-feed-scope > a {
    font-size: 11px;
  }
}
</style>
