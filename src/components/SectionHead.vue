<script setup lang="ts">
import Icon from './Icon.vue';
defineProps<{ title: string; icon?: string; to?: string; color?: string }>();
</script>
<template>
  <div class="section-head">
    <h2>
      <Icon v-if="icon" :name="icon" :size="22" :style="{ color: color || 'var(--primary)' }" />{{
        title
      }}<slot name="badge" />
    </h2>
    <div class="section-actions">
      <slot /><RouterLink v-if="to" :to="to" class="more-link"
        >查看更多<Icon name="ChevronRight" :size="15"
      /></RouterLink>
    </div>
  </div>
</template>
