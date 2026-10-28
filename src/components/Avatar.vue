<script setup lang="ts">
import { ref, watch } from 'vue';
import type { User } from '../data/types';
import { publicImage } from '../services/images';
const props = withDefaults(defineProps<{ user?: User; size?: number }>(), { size: 36 });
const failed = ref(false);
watch(
  () => props.user?.avatar,
  () => (failed.value = false),
);
</script>
<template>
  <span
    class="avatar"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.36}px` }"
    ><img
      v-if="user?.avatar && !failed"
      :src="publicImage(user.avatar)"
      :alt="user.name"
      :width="size"
      :height="size"
      decoding="async"
      loading="lazy"
      @error="failed = true"
    /><span v-else>{{ user?.name?.slice(0, 1) || '知' }}</span></span
  >
</template>
