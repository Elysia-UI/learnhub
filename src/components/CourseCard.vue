<script setup lang="ts">
import type { Course } from '../data/types';
import { useCommunity } from '../stores/community';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';
import CourseCover from './CourseCover.vue';
const props = defineProps<{ course: Course; detailed?: boolean }>();
const store = useCommunity();
</script>
<template>
  <RouterLink :to="`/courses/${props.course.id}`" class="course-card"
    ><CourseCover :course="course" />
    <div class="course-info">
      <h3>{{ course.title }}</h3>
      <p>{{ course.subtitle }}</p>
      <div v-if="detailed" class="course-tags">
        <span>{{ course.level }}</span
        ><span>{{ course.chapters.length }} 个章节</span>
      </div>
      <div class="course-bottom">
        <span class="teacher"
          ><Avatar :user="store.user(course.teacherId)" :size="19" />{{
            store.user(course.teacherId).name
          }}<span class="hours">· {{ course.hours }} 课时</span></span
        ><span class="rating"><Icon name="Star" :size="13" />{{ course.rating }}</span>
      </div>
    </div></RouterLink
  >
</template>
