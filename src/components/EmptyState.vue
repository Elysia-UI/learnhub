<script setup lang="ts">
import Icon from './Icon.vue';
withDefaults(defineProps<{ title?: string; description?: string; icon?: string }>(), {
  title: '这里还没有内容',
  description: '新的发现，正等你开启。',
  icon: 'BookOpen',
});
</script>
<template>
  <div class="empty-state">
    <span><Icon :name="icon" :size="34" /></span>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>
