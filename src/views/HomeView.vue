<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCommunity } from '../stores/community';
import Icon from '../components/Icon.vue';
import HeroCarousel from '../components/HeroCarousel.vue';
import SectionHead from '../components/SectionHead.vue';
import CourseCard from '../components/CourseCard.vue';
import PostRow from '../components/PostRow.vue';
import RightRail from '../components/RightRail.vue';
import ResourceCard from '../components/ResourceCard.vue';
const store = useCommunity(),
  sort = ref('最新'),
  resourceTab = ref('全部');
const posts = computed(() => {
  const all = store.data.posts.filter((p) => p.status === 'published');
  return [...all]
    .sort((a, b) =>
      sort.value === '最热'
        ? b.likes.length + b.comments.length - a.likes.length - a.comments.length
        : sort.value === '精华'
          ? Number(b.featured) - Number(a.featured)
          : +new Date(b.createdAt) - +new Date(a.createdAt),
    )
    .slice(0, 3);
});
const resources = computed(() =>
  store.data.resources
    .filter(
      (r) =>
        r.status === 'approved' &&
        (resourceTab.value === '全部' ||
          r.tags.some((t) => t.includes(resourceTab.value)) ||
          (resourceTab.value === '电子书' && ['PDF', 'MD'].includes(r.type)) ||
          (resourceTab.value === '学习笔记' && r.type === 'MD')),
    )
    .slice(0, 3),
);
</script>
<template>
  <div class="page-grid">
    <div class="main-column">
      <HeroCarousel />
      <section class="panel home-courses">
        <SectionHead title="推荐课程" icon="BookOpen" to="/courses" />
        <div class="course-grid home-course-grid">
          <CourseCard
            v-for="course in store.data.courses.slice(0, 4)"
            :key="course.id"
            :course="course"
          />
        </div>
      </section>
      <section class="panel home-discussions">
        <SectionHead title="热门讨论" icon="Flame" color="#ff7e30" to="/forum"
          ><div class="segmented">
            <button
              v-for="s in ['最新', '最热', '精华']"
              :key="s"
              :class="{ active: sort === s }"
              @click="sort = s"
            >
              {{ s }}
            </button>
          </div></SectionHead
        >
        <div class="posts-list">
          <PostRow v-for="post in posts" :key="post.id" :post="post" compact />
        </div>
      </section>
      <section class="panel home-resources">
        <SectionHead title="学习资源" icon="FolderOpen" color="#14b8a6" to="/resources"
          ><div class="resource-tabs">
            <button
              v-for="t in ['全部', '电子书', '工具软件', '学习笔记', '项目源码', '模板素材']"
              :key="t"
              :class="{ active: resourceTab === t }"
              @click="resourceTab = t"
            >
              {{ t }}
            </button>
          </div></SectionHead
        >
        <div v-if="resources.length" class="home-resource-grid">
          <ResourceCard v-for="resource in resources" :key="resource.id" :resource="resource" />
        </div>
        <p v-else class="small-empty">这个分类的内容还在积累中，欢迎分享你的学习资料。</p>
      </section>
      <section class="home-invitation">
        <div>
          <Icon name="Sparkles" :size="22" /><span
            >好的想法，值得被分享。<small>把你的学习心得，变成另一个人的灵感。</small></span
          >
        </div>
        <RouterLink to="/forum/new" class="btn btn-secondary"
          >写下第一篇分享<Icon name="ArrowRight" :size="16"
        /></RouterLink>
      </section>
    </div>
    <RightRail />
  </div>
</template>
