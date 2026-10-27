<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCommunity } from '../stores/community';
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
const results = computed(() => {
  if (!q.value) return [];
  const matches = (text: string) => text.toLowerCase().includes(q.value);
  return [
    ...store.data.posts
      .filter(
        (p) => p.status === 'published' && matches(`${p.title} ${p.content} ${p.tags.join(' ')}`),
      )
      .map((item) => ({ type: '帖子', item })),
    ...store.data.courses
      .filter((c) => matches(`${c.title} ${c.description} ${c.tags.join(' ')}`))
      .map((item) => ({ type: '课程', item })),
    ...store.data.questions
      .filter((c) => matches(`${c.title} ${c.content} ${c.tags.join(' ')}`))
      .map((item) => ({ type: '问答', item })),
    ...store.data.resources
      .filter(
        (c) =>
          c.status === 'approved' && matches(`${c.title} ${c.description} ${c.tags.join(' ')}`),
      )
      .map((item) => ({ type: '资源', item })),
    ...store.data.users
      .filter((c) => matches(`${c.name} ${c.bio}`))
      .map((item) => ({ type: '用户', item })),
  ];
});
const filtered = computed(() =>
  results.value.filter((r) => tab.value === '全部' || r.type === tab.value),
);
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
            t === '全部' ? results.length : results.filter((r) => r.type === t).length
          }}</span>
        </button>
      </div>
      <p class="search-result-label" v-if="q">
        “{{ route.query.q }}” 共找到 {{ filtered.length }} 条相关内容
      </p>
      <div
        v-for="r in filtered.slice((page - 1) * 8, page * 8)"
        :key="r.type + r.item.id"
        class="search-result"
      >
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
        v-if="!filtered.length"
        :title="q ? '还没有找到相关内容' : '从一个关键词开始'"
        :description="
          q ? '换个关键词试试，可能会有新的发现。' : '输入课程、技术名词或学习话题，探索知学社区。'
        "
        icon="Search"
      /><Pagination v-model="page" :total="filtered.length" />
    </section>
  </div>
</template>
