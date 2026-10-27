<script setup lang="ts">
import { ref, watch } from 'vue';
import type { User } from '../data/types';
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
      :src="user.avatar"
      :alt="user.name"
      @error="failed = true"
    /><span v-else>{{ user?.name?.slice(0, 1) || '知' }}</span></span
  >
</template>
