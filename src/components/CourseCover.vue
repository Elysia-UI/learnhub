<script setup lang="ts">
import type { Course } from '../data/types';
import Icon from './Icon.vue';
defineProps<{ course: Course }>();
</script>
<template>
  <div class="course-cover" :class="`cover-${course.visual}`">
    <img v-if="course.image" :src="course.image" :alt="course.title" loading="lazy" /><template
      v-if="course.visual === 'figma'"
      ><div class="cover-orbit"></div>
      <div class="figma-symbol"><i></i><i></i><i></i><i></i><i></i></div>
      <span class="cover-caption">DESIGN YOUR IDEAS</span></template
    ><template v-else-if="course.visual === 'spring'"
      ><div class="tech-grid"></div>
      <div class="chip"><Icon name="Code2" :size="34" /></div>
      <span class="cover-caption">BUILD SOMETHING GREAT</span></template
    ><template v-else-if="course.visual === 'ai'"
      ><div class="image-shade"></div>
      <div class="ai-cover-title">AI<span>未来，从这里开始</span></div></template
    ><span class="course-badge" :class="`badge-${course.visual}`">{{ course.badge }}</span
    ><span class="cover-play"><Icon name="Play" :size="18" /></span>
  </div>
</template>
