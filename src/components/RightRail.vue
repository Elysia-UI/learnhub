<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCommunity } from '../stores/community';
import { level, date } from '../services/format';
import { api } from '../services/api';
import SectionHead from './SectionHead.vue';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';
const store = useCommunity();
const leaders = ref<import('../data/types').User[]>([]),
  topics = ref<[string, number][]>([]);
async function loadRail() {
  try {
    const [r, t] = await Promise.all([
      api<{ items: import('../data/types').User[] }>('/leaderboard?pageSize=5'),
      api<[string, number][]>('/topics'),
    ]);
    leaders.value = r.items;
    topics.value = t.slice(0, 6);
  } catch {}
}
void loadRail();
watch(
  () => store.pending,
  (n, old) => {
    if (old > 0 && n === 0) void loadRail();
  },
);
const stats = computed(() => [
  { label: '社区伙伴', value: store.data.stats?.users || 0, icon: 'Users', color: 'cyan' },
  { label: '精选课程', value: store.data.stats?.courses || 0, icon: 'Box', color: 'teal' },
  {
    label: '交流讨论',
    value: (store.data.stats?.posts || 0) + (store.data.stats?.questions || 0),
    icon: 'MessagesSquare',
    color: 'blue',
  },
  {
    label: '学习资源',
    value: store.data.stats?.resources || 0,
    icon: 'Download',
    color: 'purple',
  },
]);
</script>
<template>
  <aside class="right-rail">
    <section class="panel community-stats">
      <SectionHead title="社区数据" icon="ChartNoAxesCombined" />
      <p class="section-subtitle">加入我们，一起学习成长<Icon name="Sparkles" :size="13" /></p>
      <div class="stats-grid">
        <div v-for="stat in stats" :key="stat.label" class="stat-tile">
          <span class="stat-icon" :class="stat.color"><Icon :name="stat.icon" :size="22" /></span>
          <div>
            <strong>{{ stat.value }}<small v-if="stat.label === '社区伙伴'"> 位</small></strong
            ><span>{{ stat.label }}</span>
          </div>
        </div>
      </div>
      <div class="seed-note"><span class="status-dot"></span>持续分享 · 共同成长</div>
    </section>
    <section class="panel">
      <SectionHead title="学习成长榜" icon="Trophy" color="#f59e0b" to="/leaderboard" />
      <div class="leader-list">
        <RouterLink
          v-for="(person, i) in leaders"
          :key="person.id"
          :to="`/members/${person.id}`"
          class="leader-row"
          ><span class="rank" :class="`rank-${i}`">{{ i + 1 }}</span
          ><Avatar :user="person" :size="31" /><span class="leader-name"
            >{{ person.name }}<span class="level-badge">Lv.{{ level(person.points) }}</span></span
          ><span class="leader-points">{{ person.points }}<small> 积分</small></span></RouterLink
        >
      </div>
    </section>
    <section class="panel">
      <SectionHead title="热门话题" icon="Hash" color="#8358ef" to="/topics" />
      <div class="topic-list">
        <RouterLink
          v-for="([topic, n], i) in topics"
          :key="topic"
          :to="`/search?q=${encodeURIComponent(topic)}`"
          ><span class="topic-hash" :class="`topic-${i % 4}`">#</span><span>{{ topic }}</span
          ><span class="topic-count">{{ n }} 篇内容</span></RouterLink
        >
      </div>
    </section>
    <section class="panel">
      <SectionHead title="社区公告" icon="Megaphone" color="#fb8524" to="/announcements" />
      <div class="notice-list">
        <button
          v-for="notice in store.data.notices.filter((n) => n.status !== 'draft').slice(0, 4)"
          :key="notice.id"
          @click="store.modal = { type: 'notice', payload: notice }"
        >
          <span
            class="tag"
            :class="
              notice.type === '置顶'
                ? 'tag-red'
                : notice.type === '活动'
                  ? 'tag-orange'
                  : 'tag-blue'
            "
            >{{ notice.type }}</span
          ><span class="notice-title">{{ notice.title }}</span
          ><time>{{ date(notice.createdAt) }}</time>
        </button>
      </div>
    </section>
    <footer class="rail-footer">
      <span>让知识流动，让成长发生。</span>
      <div>
        <button @click="store.modal = { type: 'about' }">关于知学</button><span>·</span
        ><button @click="store.modal = { type: 'notice', payload: store.data.notices[0] }">
          社区公约
        </button>
      </div>
      <p>© {{ new Date().getFullYear() }} LearnHub 知学社区</p>
    </footer>
  </aside>
</template>
