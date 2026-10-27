<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCommunity } from '../stores/community';
import Icon from '../components/Icon.vue';
import CourseCard from '../components/CourseCard.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
const store = useCommunity(),
  category = ref('all'),
  keyword = ref(''),
  difficulty = ref('全部难度'),
  sort = ref('推荐优先'),
  page = ref(1);
const courses = computed(() =>
  store.data.courses
    .filter(
      (c) =>
        (category.value === 'all' || c.category === category.value) &&
        (difficulty.value === '全部难度' || c.level === difficulty.value) &&
        `${c.title} ${c.description} ${c.tags.join(' ')}`
          .toLowerCase()
          .includes(keyword.value.toLowerCase()),
    )
    .sort((a, b) =>
      sort.value === '最新发布'
        ? +new Date(b.createdAt) - +new Date(a.createdAt)
        : b.rating - a.rating,
    ),
);
watch([category, keyword, difficulty, sort], () => (page.value = 1));
</script>
<template>
  <div class="full-page">
    <div class="page-intro">
      <div>
        <div class="eyebrow">LEARN SOMETHING NEW / 课程中心</div>
        <h1>把好奇，变成你的能力<span class="title-dot">.</span></h1>
        <p>跟随优秀的分享者，从理解一个概念，到完成一份作品。</p>
      </div>
      <button
        v-if="['teacher', 'admin'].includes(store.currentUser?.role || '')"
        class="btn btn-primary"
        @click="store.modal = { type: 'course' }"
      >
        <Icon name="Plus" :size="17" />创建课程
      </button>
    </div>
    <section class="courses-feature">
      <div>
        <span class="tag">本周学习灵感</span>
        <h2>下一次成长<br />从现在开始。</h2>
        <p>每天留一点时间，给那个想变得更好的自己。</p>
        <button class="btn btn-primary" @click="category = 'ai'">
          探索 AI 课程<Icon name="ArrowRight" :size="17" />
        </button>
      </div>
      <div class="feature-art">
        <span class="feature-orbit"></span>
        <div class="floating-book"><Icon name="BookOpen" :size="90" :stroke="1.2" /></div>
        <span class="feature-bubble bubble-one"><Icon name="Code2" :size="25" /></span
        ><span class="feature-bubble bubble-two"><Icon name="Sparkles" :size="24" /></span
        ><span class="feature-bubble bubble-three"><Icon name="GraduationCap" :size="25" /></span>
      </div>
      <div class="feature-note">
        <Icon name="CheckCircle2" :size="19" /><span
          >按照自己的节奏学习<small>知识，从来不设限</small></span
        >
      </div>
    </section>
    <div class="category-pills">
      <button :class="{ active: category === 'all' }" @click="category = 'all'">全部课程</button
      ><button
        v-for="c in store.data.categories"
        :key="c.id"
        :class="{ active: category === c.id }"
        @click="category = c.id"
      >
        <Icon :name="c.icon" :size="15" />{{ c.name }}
      </button>
    </div>
    <div class="content-toolbar">
      <h2>
        发现好课程<span>{{ courses.length }} 门课程</span>
      </h2>
      <div>
        <label class="inline-search"
          ><Icon name="Search" :size="16" /><input
            v-model="keyword"
            placeholder="搜索课程"
            aria-label="搜索课程" /></label
        ><select v-model="difficulty" aria-label="课程难度">
          <option>全部难度</option>
          <option>入门</option>
          <option>进阶</option>
          <option>通用</option></select
        ><select v-model="sort" aria-label="课程排序">
          <option>推荐优先</option>
          <option>最新发布</option>
        </select>
      </div>
    </div>
    <div v-if="courses.length" class="course-grid catalog-course-grid">
      <CourseCard
        v-for="course in courses.slice((page - 1) * 8, page * 8)"
        :key="course.id"
        :course="course"
        detailed
      />
    </div>
    <section v-else class="panel">
      <EmptyState title="还没有找到这类课程" description="换一个分类，或试试更简短的关键词。" />
    </section>
    <Pagination v-model="page" :total="courses.length" />
    <div class="learning-tip">
      <Icon name="Coffee" :size="20" /><span>学习不必急于求成，每一次专注都算数。</span>
    </div>
  </div>
</template>
