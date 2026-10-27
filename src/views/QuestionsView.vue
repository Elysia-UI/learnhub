<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCommunity } from '../stores/community';
import { timeAgo } from '../services/format';
import Icon from '../components/Icon.vue';
import Avatar from '../components/Avatar.vue';
import RightRail from '../components/RightRail.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
const store = useCommunity(),
  filter = ref('全部问题'),
  category = ref('all'),
  keyword = ref(''),
  page = ref(1);
const questions = computed(() =>
  store.data.questions
    .filter(
      (q) =>
        (category.value === 'all' || q.category === category.value) &&
        (filter.value !== '待解决' || !q.acceptedId) &&
        (filter.value !== '已解决' || q.acceptedId) &&
        `${q.title} ${q.content} ${q.tags.join(' ')}`
          .toLowerCase()
          .includes(keyword.value.toLowerCase()),
    )
    .sort((a, b) =>
      filter.value === '热门问题'
        ? b.views - a.views
        : +new Date(b.createdAt) - +new Date(a.createdAt),
    ),
);
watch([category, keyword, filter], () => (page.value = 1));
</script>
<template>
  <div class="page-grid">
    <div class="main-column">
      <div class="page-intro">
        <div>
          <div class="eyebrow">ASK. LEARN. GROW. / 学习问答</div>
          <h1>好问题，打开新的可能<span class="title-dot">.</span></h1>
          <p>把困惑说出来，总有人愿意陪你找到答案。</p>
        </div>
        <button
          class="btn btn-primary"
          @click="store.requireUser() && (store.modal = { type: 'question' })"
        >
          <Icon name="Plus" :size="18" />我要提问
        </button>
      </div>
      <div class="question-banner">
        <span><Icon name="CircleHelp" :size="35" /></span>
        <div>
          <h3>每一个「为什么」，都值得认真回答</h3>
          <p>描述清楚你的背景、尝试和具体困惑，让交流更有收获。</p>
        </div>
        <Icon class="question-banner-spark" name="Sparkles" :size="30" />
      </div>
      <div class="category-pills">
        <button :class="{ active: category === 'all' }" @click="category = 'all'">全部分类</button
        ><button
          v-for="c in store.data.categories.slice(0, 5)"
          :key="c.id"
          :class="{ active: category === c.id }"
          @click="category = c.id"
        >
          {{ c.name }}
        </button>
      </div>
      <section class="panel question-panel">
        <div class="list-toolbar">
          <div class="line-tabs">
            <button
              v-for="f in ['全部问题', '待解决', '已解决', '热门问题']"
              :key="f"
              :class="{ active: filter === f }"
              @click="filter = f"
            >
              {{ f }}
            </button>
          </div>
          <label class="inline-search"
            ><Icon name="Search" :size="16" /><input
              v-model="keyword"
              aria-label="搜索问题"
              placeholder="搜索问题"
          /></label>
        </div>
        <article
          v-for="q in questions.slice((page - 1) * 8, page * 8)"
          :key="q.id"
          class="question-row"
        >
          <div class="answer-count" :class="{ solved: q.acceptedId }">
            <strong>{{ q.answers.length }}</strong
            ><span>{{ q.acceptedId ? '已解决' : '回答' }}</span>
          </div>
          <div class="question-copy">
            <RouterLink :to="`/questions/${q.id}`" class="question-title">{{ q.title }}</RouterLink>
            <p>{{ q.content }}</p>
            <div class="question-row-footer">
              <div class="question-tags">
                <RouterLink
                  v-for="tag in q.tags"
                  :key="tag"
                  :to="`/search?q=${encodeURIComponent(tag)}`"
                  >{{ tag }}</RouterLink
                >
              </div>
              <span
                ><Avatar :user="store.user(q.authorId)" :size="20" />{{ store.user(q.authorId).name
                }}<b>·</b>{{ timeAgo(q.createdAt) }}</span
              >
            </div>
          </div>
        </article>
        <EmptyState
          v-if="!questions.length"
          title="暂时没有找到相关问题"
          description="也许你的提问，就会成为另一个人的学习起点。"
        /><Pagination v-model="page" :total="questions.length" />
      </section>
    </div>
    <RightRail />
  </div>
</template>
