<script setup lang="ts">
import EmptyState from '../components/EmptyState.vue';
</script>
<template>
  <section class="panel not-found">
    <span class="not-found-number">404</span
    ><EmptyState title="这条路，暂时还没有打开" description="回到首页，继续发现学习的更多可能。"
      ><RouterLink to="/" class="btn btn-primary">回到社区首页</RouterLink></EmptyState
    >
  </section>
</template>
