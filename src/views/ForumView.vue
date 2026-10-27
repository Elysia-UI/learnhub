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
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: '8',
      q: keyword.value,
      category: category.value,
      sort: sort.value === '最热' ? 'hot' : sort.value === '精华' ? 'featured' : 'latest',
    });
    const result = await api<{ items: import('../data/types').Post[]; total: number }>(
      '/posts?' + params,
    );
    if (number === requestNo) {
      posts.value = result.items;
      total.value = result.total;
    }
  } catch (e) {
    if (number === requestNo) listError.value = (e as Error).message;
  } finally {
    if (number === requestNo) listLoading.value = false;
  }
}
watch([category, sort, keyword], () => {
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
      <div class="category-pills">
        <button :class="{ active: category === 'all' }" @click="router.push('/forum')">
          全部讨论</button
        ><button
          v-for="c in store.data.categories"
          :key="c.id"
          :class="{ active: category === c.id }"
          @click="router.push({ path: '/forum', query: { category: c.id } })"
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
        <PostRow v-for="post in posts" :key="post.id" :post="post" /><EmptyState
          v-if="!listLoading && !listError && !posts.length"
          title="暂时没有相关讨论"
          description="换个关键词试试，或成为第一个分享的人。"
          ><RouterLink to="/forum/new" class="btn btn-primary">发布新帖</RouterLink></EmptyState
        ><Pagination v-model="page" :total="total" />
      </section>
      <div class="list-end" v-if="total > 0 && total <= 8">
        <span></span>每一次交流，都是成长的开始<span></span>
      </div>
    </div>
    <RightRail />
  </div>
</template>
