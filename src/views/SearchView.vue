<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCommunity } from '../stores/community';
import { api } from '../services/api';
import Icon from '../components/Icon.vue';
import PostRow from '../components/PostRow.vue';
import ResourceCard from '../components/ResourceCard.vue';
import CourseCard from '../components/CourseCard.vue';
import Avatar from '../components/Avatar.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
const store = useCommunity(),
  route = useRoute(),
  router = useRouter(),
  tab = ref('全部'),
  page = ref(1),
  keyword = ref(String(route.query.q || ''));
const q = computed(() =>
  String(route.query.q || '')
    .trim()
    .toLowerCase(),
);
const results = ref<any[]>([]),
  counts = ref<Record<string, number>>({}),
  total = ref(0),
  loading = ref(false),
  error = ref(''),
  sort = ref('latest');
let sequence = 0;
async function load() {
  const n = ++sequence;
  loading.value = true;
  error.value = '';
  try {
    const r = await api<{
      items: any[];
      counts: Record<string, number>;
      total: number;
      users: any[];
    }>(
      '/search?' +
        new URLSearchParams({
          q: q.value,
          type: tab.value,
          page: String(page.value),
          sort: sort.value,
        }),
    );
    if (n !== sequence) return;
    results.value = r.items;
    counts.value = r.counts;
    total.value = r.total;
    store.hydrate(r);
    for (const row of r.items) {
      const kind = (
        { 帖子: 'posts', 课程: 'courses', 问答: 'questions', 资源: 'resources' } as const
      )[row.type as '帖子'];
      if (kind) store.hydrate({ items: [row.item] }, kind);
    }
  } catch (e) {
    if (n === sequence) error.value = (e as Error).message;
  } finally {
    if (n === sequence) loading.value = false;
  }
}
watch([q, tab, sort], () => {
  if (page.value !== 1) page.value = 1;
  else void load();
});
watch(page, () => void load());
void load();
watch([q, tab], () => {
  page.value = 1;
  keyword.value = String(route.query.q || '');
});
</script>
<template>
  <div class="narrow-page">
    <div class="page-intro">
      <div>
        <div class="eyebrow">FIND YOUR NEXT INSPIRATION / 全站搜索</div>
        <h1>让好奇，找到方向<span class="title-dot">.</span></h1>
        <p>在课程、讨论与资源之间，发现下一份灵感。</p>
      </div>
    </div>
    <form
      class="search-page-form"
      @submit.prevent="router.replace({ path: '/search', query: { q: keyword.trim() } })"
    >
      <Icon name="Search" :size="23" /><input
        v-model="keyword"
        required
        aria-label="搜索关键词"
        placeholder="搜索你感兴趣的内容…"
      /><button class="btn btn-primary">搜索</button>
    </form>
    <section class="panel search-results">
      <div class="line-tabs">
        <button
          v-for="t in ['全部', '帖子', '课程', '问答', '资源', '用户']"
          :key="t"
          :class="{ active: tab === t }"
          @click="tab = t"
        >
          {{ t
          }}<span>{{
            t === '全部' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[t] || 0
          }}</span>
        </button>
      </div>
      <p v-if="loading" class="small-empty">正在搜索数据库…</p>
      <p v-if="error" class="form-error">
        {{ error }} <button class="text-link" @click="load">重试</button>
      </p>
      <label class="field"
        >排序<select v-model="sort">
          <option value="latest">最新</option>
          <option value="hot">最热</option>
        </select></label
      >
      <p class="search-result-label" v-if="q">
        “{{ route.query.q }}” 共找到 {{ total }} 条相关内容
      </p>
      <div v-for="r in results" :key="r.type + r.item.id" class="search-result">
        <span class="result-type">{{ r.type }}</span
        ><PostRow v-if="r.type === '帖子'" :post="r.item as any" />
        <div v-else-if="r.type === '课程'" class="search-course">
          <CourseCard :course="r.item as any" />
        </div>
        <ResourceCard v-else-if="r.type === '资源'" :resource="r.item as any" /><RouterLink
          v-else-if="r.type === '问答'"
          :to="`/questions/${r.item.id}`"
          class="search-question"
          ><Icon name="CircleHelp" :size="23" />
          <div>
            <h3>{{ (r.item as any).title }}</h3>
            <p>{{ (r.item as any).content }}</p>
          </div>
          <Icon name="ChevronRight" :size="18" /></RouterLink
        ><RouterLink v-else :to="`/members/${r.item.id}`" class="search-member"
          ><Avatar :user="r.item as any" :size="47" />
          <div>
            <h3>{{ (r.item as any).name }}</h3>
            <p>{{ (r.item as any).bio }}</p>
          </div>
          <Icon name="ArrowUpRight" :size="18"
        /></RouterLink>
      </div>
      <EmptyState
        v-if="!loading && !error && !total"
        :title="q ? '还没有找到相关内容' : '从一个关键词开始'"
        :description="
          q ? '换个关键词试试，可能会有新的发现。' : '输入课程、技术名词或学习话题，探索知学社区。'
        "
        icon="Search"
      /><Pagination v-model="page" :total="total" />
    </section>
  </div>
</template>
