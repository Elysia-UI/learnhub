<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useCommunity } from '../stores/community';
import Icon from './Icon.vue';

const store = useCommunity();
const slides = [
  {
    id: 'welcome',
    image: '/images/hero.png',
    alt: '阳光下的校园与正在阅读的同学',
    eyebrow: '更好的学习，遇见更大的世界',
    title: '欢迎来到 LearnHub',
    description: '一个专注于学习、交流与分享的知识社区',
    features: [
      ['BookOpen', '优质课程'],
      ['MessagesSquare', '活跃社区'],
      ['FolderOpen', '丰富资源'],
      ['Users', '成长伙伴'],
    ],
    primary: { label: '开始探索', to: '/courses' },
    secondary: { label: '认识知学社区', to: '' },
    note: ['学习，', '让更好的自己', '在高处相遇 ♡'],
  },
  {
    id: 'learn',
    image: '/images/community/library.jpg',
    alt: '摆满书籍的图书馆书架',
    eyebrow: '给好奇心，留一点认真生长的时间',
    title: '把好奇，变成能力',
    description: '找到适合自己的课程，让每一次学习都有收获',
    features: [
      ['BookOpen', '图文课程'],
      ['Target', '学习进度'],
      ['FolderOpen', '实用资料'],
      ['Award', '记录成长'],
    ],
    primary: { label: '发现好课程', to: '/courses' },
    secondary: { label: '探索学习资源', to: '/resources' },
    note: ['今天，', '比昨天多懂一点', '让热爱慢慢生长 ♡'],
  },
  {
    id: 'community',
    image: '/images/community/coding.jpg',
    alt: '学习伙伴一起讨论电脑上的内容',
    eyebrow: '一份真实经验，也能成为别人的灵感',
    title: '好想法，值得被看见',
    description: '分享你的实践与困惑，遇见愿意一起探索的人',
    features: [
      ['MessagesSquare', '真实交流'],
      ['Pencil', '经验分享'],
      ['CircleHelp', '互相解答'],
      ['Users', '共同成长'],
    ],
    primary: { label: '去社区聊聊', to: '/forum' },
    secondary: { label: '发现好问题', to: '/questions' },
    note: ['分享，', '是一场双向成长', '让知识在这里相遇 ♡'],
  },
];
const index = ref(0),
  reducedMotion = ref(false),
  keyboardFocused = ref(false),
  hovered = ref(false),
  hidden = ref(false);
const announcement = ref('');
const slide = computed(() => slides[index.value]!);
const playing = computed(
  () => !reducedMotion.value && !hovered.value && !hidden.value && !keyboardFocused.value,
);
let timer: ReturnType<typeof setTimeout> | undefined;
let mounted = false;
let motion: MediaQueryList | undefined;
function schedule() {
  clearTimeout(timer);
  if (mounted && playing.value)
    timer = setTimeout(() => (index.value = (index.value + 1) % slides.length), 6000);
}
function select(next: number) {
  index.value = (next + slides.length) % slides.length;
  announcement.value = `第 ${index.value + 1} 张，共 ${slides.length} 张：${slide.value.title}`;
  schedule();
}
function visibilityChanged() {
  hidden.value = document.hidden;
}
function motionChanged() {
  reducedMotion.value = !!motion?.matches;
}
function focusChanged(event: FocusEvent) {
  keyboardFocused.value = (event.target as HTMLElement).matches(':focus-visible');
}
function focusLeft(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
    keyboardFocused.value = false;
}
watch([playing, index], schedule);
onMounted(() => {
  mounted = true;
  for (const item of slides.slice(1)) {
    const image = new Image();
    image.src = item.image;
  }
  motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionChanged();
  motion.addEventListener('change', motionChanged);
  document.addEventListener('visibilitychange', visibilityChanged);
  visibilityChanged();
  schedule();
});
onUnmounted(() => {
  mounted = false;
  clearTimeout(timer);
  motion?.removeEventListener('change', motionChanged);
  document.removeEventListener('visibilitychange', visibilityChanged);
});
</script>

<template>
  <section
    class="hero-banner hero-carousel"
    :data-slide="slide.id"
    role="region"
    aria-roledescription="轮播图"
    aria-label="LearnHub 精选内容"
    tabindex="0"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focusChanged"
    @focusout="focusLeft"
    @keydown.left.prevent="select(index - 1)"
    @keydown.right.prevent="select(index + 1)"
  >
    <Transition name="hero-fade">
      <div
        :key="slide.id"
        class="hero-slide"
        role="group"
        aria-roledescription="幻灯片"
        :aria-label="`${index + 1} / ${slides.length}：${slide.title}`"
      >
        <img
          class="hero-art"
          :src="slide.image"
          :alt="slide.alt"
          :fetchpriority="index === 0 ? 'high' : 'auto'"
        />
        <div class="hero-gradient"></div>
        <div class="hero-content">
          <span class="hero-eyebrow">{{ slide.eyebrow }}</span>
          <h1>{{ slide.title }}</h1>
          <p>{{ slide.description }}</p>
          <div class="hero-features">
            <span v-for="[icon, label] in slide.features" :key="label"
              ><Icon :name="icon!" :size="15" />{{ label }}</span
            >
          </div>
          <div class="hero-buttons">
            <RouterLink :to="slide.primary.to" class="btn hero-primary"
              >{{ slide.primary.label }}<Icon name="ChevronRight" :size="18"
            /></RouterLink>
            <RouterLink
              v-if="slide.secondary.to"
              :to="slide.secondary.to"
              class="btn hero-secondary"
              >{{ slide.secondary.label }}<Icon name="ArrowRight" :size="16"
            /></RouterLink>
            <button v-else class="btn hero-secondary" @click="store.modal = { type: 'about' }">
              <Icon name="Play" :size="18" />{{ slide.secondary.label }}
            </button>
          </div>
        </div>
        <div class="hero-handwriting" aria-hidden="true">
          {{ slide.note[0] }}<br /><span>{{ slide.note[1] }}</span
          ><br /><span class="last">{{ slide.note[2] }}</span>
        </div>
      </div>
    </Transition>
    <div class="hero-pagination" role="group" aria-label="选择横幅">
      <button
        v-for="(item, i) in slides"
        :key="item.id"
        :class="{ active: index === i }"
        :aria-label="`切换到第 ${i + 1} 张：${item.title}`"
        :aria-current="index === i ? 'true' : undefined"
        @click="select(i)"
      >
        <span></span>
      </button>
    </div>
    <span class="carousel-announcement" aria-live="polite" aria-atomic="true">{{
      announcement
    }}</span>
  </section>
</template>

<style scoped>
.hero-carousel {
  height: 334px;
}
.hero-slide {
  position: absolute;
  inset: 0;
  isolation: isolate;
}
.hero-content {
  position: relative;
  padding-bottom: 58px;
}
.hero-content > p {
  max-width: 550px;
}
[data-slide='learn'] .hero-gradient {
  background: linear-gradient(90deg, #182b61f2 0%, #29345bd9 42%, #1b294d48 100%);
}
[data-slide='community'] .hero-gradient {
  background: linear-gradient(90deg, #17285bed 0%, #214373d9 42%, #18355733 100%);
}
.hero-fade-enter-active,
.hero-fade-leave-active {
  transition: opacity 0.45s ease;
}
.hero-fade-enter-from,
.hero-fade-leave-to {
  opacity: 0;
}
.hero-pagination {
  bottom: 10px;
  z-index: 2;
  gap: 2px;
  transform: translateX(-50%);
}
.hero-pagination button {
  display: grid;
  place-items: center;
  width: 25px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
}
.hero-pagination button span {
  width: 6px;
  height: 6px;
  border-radius: 8px;
  background: #ffffff70;
  transition:
    width 0.25s,
    background-color 0.25s;
}
.hero-pagination button.active span {
  width: 20px;
  background: white;
}
.hero-carousel:focus-visible,
.hero-carousel button:focus-visible,
.hero-carousel a:focus-visible {
  outline: 2px solid white;
  outline-offset: -3px;
}
.carousel-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 700px) {
  .hero-carousel {
    height: 320px;
  }
  .hero-content {
    padding-top: 25px;
  }
  .hero-content h1 {
    white-space: normal;
  }
  .hero-content > p {
    max-width: 285px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hero-fade-enter-active,
  .hero-fade-leave-active,
  .hero-pagination button span {
    transition: none;
  }
}
</style>
