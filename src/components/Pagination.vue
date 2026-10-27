<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
const props = withDefaults(defineProps<{ total: number; modelValue: number; size?: number }>(), {
  size: 8,
});
const emit = defineEmits<{ 'update:modelValue': [number] }>();
const pages = computed(() => Math.ceil(props.total / props.size));
</script>
<template>
  <div v-if="pages > 1" class="pagination">
    <button
      class="icon-btn"
      aria-label="上一页"
      :disabled="modelValue <= 1"
      @click="emit('update:modelValue', modelValue - 1)"
    >
      <Icon name="ChevronLeft" :size="17" /></button
    ><button
      v-for="n in pages"
      :key="n"
      :class="{ active: modelValue === n }"
      @click="emit('update:modelValue', n)"
    >
      {{ n }}</button
    ><button
      class="icon-btn"
      aria-label="下一页"
      :disabled="modelValue >= pages"
      @click="emit('update:modelValue', modelValue + 1)"
    >
      <Icon name="ChevronRight" :size="17" /></button
    ><span>共 {{ total }} 条</span>
  </div>
</template>
