<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useCommunity } from '../stores/community';
import { level, date } from '../services/format';
import Icon from '../components/Icon.vue';
import Avatar from '../components/Avatar.vue';
const route = useRoute(),
  store = useCommunity();
const section = computed(() => String(route.params.section));
const info = computed(
  () =>
    ({
      categories: {
        en: 'FIND YOUR COMMUNITY',
        title: '热爱不同，成长同频',
        description: '发现你的兴趣所在，找到一起探索的同路人。',
      },
      topics: {
        en: 'JOIN THE CONVERSATION',
        title: '从一个话题，遇见共鸣',
        description: '这里有你关心的问题，也有你尚未发现的精彩。',
      },
      announcements: {
        en: 'COMMUNITY UPDATES',
        title: '知学社区，有新鲜事',
        description: '活动、更新与社区公约，一起关注我们的成长。',
      },
      leaderboard: {
        en: 'GROW BETTER TOGETHER',
        title: '每一份热爱，都闪闪发光',
        description: '为认真学习、乐于分享的伙伴们，送上一份鼓励。',
      },
    })[section.value],
);
const topics = computed(() => {
  const tags = new Map<string, number>();
  [...store.data.posts, ...store.data.questions].forEach((p) =>
    p.tags.forEach((t) => tags.set(t, (tags.get(t) || 0) + 1)),
  );
  return [...tags].sort((a, b) => b[1] - a[1]);
});
const leaders = computed(() =>
  [...store.data.users].filter((u) => u.role !== 'admin').sort((a, b) => b.points - a.points),
);
</script>
<template>
  <div class="full-page">
    <div class="page-intro">
      <div>
        <div class="eyebrow">{{ info?.en }}</div>
        <h1>{{ info?.title }}<span class="title-dot">.</span></h1>
        <p>{{ info?.description }}</p>
      </div>
    </div>
    <div v-if="section === 'categories'" class="discover-categories">
      <RouterLink
        v-for="c in store.data.categories"
        :key="c.id"
        :to="`/forum?category=${c.id}`"
        class="panel category-discover-card"
        ><span
          class="category-discover-icon"
          :style="{ color: c.color, background: c.color + '15' }"
          ><Icon :name="c.icon" :size="31"
        /></span>
        <h2>{{ c.name }}</h2>
        <p>{{ c.description }}</p>
        <div>
          <span>{{ store.data.posts.filter((p) => p.category === c.id).length }} 篇讨论</span
          ><Icon name="ArrowUpRight" :size="19" /></div
      ></RouterLink>
    </div>
    <div v-else-if="section === 'topics'" class="topic-catalog">
      <RouterLink
        v-for="([topic, n], i) in topics"
        :key="topic"
        :to="`/search?q=${encodeURIComponent(topic)}`"
        class="panel topic-card"
        ><span class="topic-hash" :class="`topic-${i % 4}`">#</span>
        <h3>{{ topic }}</h3>
        <p>{{ n }} 篇相关讨论</p>
        <span class="text-link">参与话题<Icon name="ArrowRight" :size="15" /></span
      ></RouterLink>
    </div>
    <section v-else-if="section === 'announcements'" class="panel announcements-page">
      <button
        v-for="notice in store.data.notices"
        :key="notice.id"
        class="announcement-row"
        @click="store.modal = { type: 'notice', payload: notice }"
      >
        <span class="announcement-icon" :class="{ pinned: notice.pinned }"
          ><Icon
            :name="
              notice.type === '活动' ? 'Sparkles' : notice.type === '更新' ? 'Zap' : 'Megaphone'
            "
            :size="25"
        /></span>
        <div>
          <span class="tag" :class="notice.pinned ? 'tag-red' : 'tag-blue'">{{ notice.type }}</span>
          <h3>{{ notice.title }}</h3>
          <p>{{ notice.content.slice(0, 70) }}</p>
        </div>
        <time>{{ date(notice.createdAt) }}</time
        ><Icon name="ChevronRight" :size="18" />
      </button>
    </section>
    <section v-else class="leaderboard-page">
      <div class="leaderboard-podium">
        <RouterLink
          v-for="(person, i) in leaders.slice(0, 3)"
          :key="person.id"
          :to="`/members/${person.id}`"
          class="panel podium-person"
          :class="`podium-${i}`"
          ><span class="podium-rank"><Icon name="Trophy" :size="27" />{{ i + 1 }}</span
          ><Avatar :user="person" :size="72" />
          <h2>{{ person.name }}</h2>
          <span class="level-badge">Lv.{{ level(person.points) }}</span
          ><strong>{{ person.points }}<small> 积分</small></strong>
          <p>{{ person.bio }}</p></RouterLink
        >
      </div>
      <div class="panel leaderboard-table">
        <div class="table-caption">
          <h2>社区成长榜</h2>
          <span>依据成长积分实时排序</span>
        </div>
        <RouterLink v-for="(person, i) in leaders" :key="person.id" :to="`/members/${person.id}`"
          ><span class="rank" :class="`rank-${i}`">{{ i + 1 }}</span
          ><Avatar :user="person" :size="40" /><strong>{{ person.name }}</strong
          ><span class="leader-bio">{{ person.bio }}</span
          ><span class="level-badge">Lv.{{ level(person.points) }}</span
          ><span class="leaderboard-points">{{ person.points }} 积分</span></RouterLink
        >
      </div>
    </section>
  </div>
</template>
