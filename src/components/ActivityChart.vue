<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useCommunity } from '../stores/community';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);
const el = ref<HTMLElement>(),
  store = useCommunity();
let chart: echarts.ECharts | undefined, observer: ResizeObserver | undefined;
function render() {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return d.toLocaleDateString('sv-SE');
  });
  const text = store.theme === 'dark' ? '#94a3b8' : '#8893a7';
  chart?.setOption({
    animationDuration: 350,
    tooltip: { trigger: 'axis' },
    legend: {
      right: 8,
      top: 0,
      textStyle: { color: text },
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
    },
    grid: { left: 32, right: 15, bottom: 24, top: 45 },
    xAxis: {
      type: 'category',
      data: days.map((d) => d.slice(5)),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: text },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: text },
      splitLine: {
        lineStyle: { color: store.theme === 'dark' ? '#2a3450' : '#eef1f7', type: 'dashed' },
      },
    },
    series: [
      {
        name: '发表帖子',
        type: 'bar',
        barWidth: 14,
        data: days.map((d) => store.data.posts.filter((p) => p.createdAt.startsWith(d)).length),
        itemStyle: { color: '#7775fa', borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '提出问题',
        type: 'line',
        smooth: true,
        symbolSize: 7,
        data: days.map((d) => store.data.questions.filter((q) => q.createdAt.startsWith(d)).length),
        itemStyle: { color: '#32c5b5' },
        lineStyle: { width: 3 },
      },
    ],
  });
}
onMounted(() => {
  if (el.value) {
    chart = echarts.init(el.value);
    render();
    observer = new ResizeObserver(() => chart?.resize());
    observer.observe(el.value);
  }
});
watch(() => [store.theme, store.data.posts.length, store.data.questions.length], render);
onUnmounted(() => {
  observer?.disconnect();
  chart?.dispose();
});
</script>
<template>
  <div ref="el" class="activity-chart" aria-label="最近七天帖子和问题数量图表"></div>
</template>
