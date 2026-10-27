<script setup lang="ts">
import type { Post } from '../data/types';
import { useCommunity } from '../stores/community';
import { timeAgo, count } from '../services/format';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';
defineProps<{ post: Post; compact?: boolean }>();
const store = useCommunity();
</script>
<template>
  <article class="post-row" :class="{ compact }">
    <RouterLink :to="`/members/${post.authorId}`" class="post-avatar"
      ><Avatar :user="store.user(post.authorId)" :size="compact ? 42 : 46"
    /></RouterLink>
    <div class="post-copy">
      <div class="post-title">
        <span v-if="post.status !== 'published'" class="tag tag-orange">{{
          post.status === 'pending' ? '待审核' : '已驳回'
        }}</span>
        <RouterLink :to="`/forum/${post.id}`">{{ post.title }}</RouterLink
        ><span v-if="post.pinned" class="tag tag-orange">置顶</span
        ><span v-if="post.featured" class="tag tag-red">精华</span
        ><span v-else class="tag" :class="post.type === '分享' ? 'tag-green' : 'tag-blue'">{{
          post.type
        }}</span>
      </div>
      <p>
        {{
          post.content
            .replace(/[#*>`\n]/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(0, 86)
        }}…
      </p>
      <div class="post-meta">
        <span>{{ store.user(post.authorId).name }}</span
        ><b>·</b><time>{{ timeAgo(post.createdAt) }}</time
        ><b>·</b
        ><RouterLink :to="`/forum?category=${post.category}`" class="category-link">{{
          store.category(post.category)?.name
        }}</RouterLink>
        <div class="post-stats">
          <span><Icon name="MessageSquare" :size="13" />{{ post.comments.length }}</span
          ><span><Icon name="Eye" :size="14" />{{ count(post.views) }}</span>
        </div>
      </div>
    </div>
    <RouterLink v-if="post.image" :to="`/forum/${post.id}`" class="post-thumbnail"
      ><img :src="post.image" alt="帖子配图" loading="lazy"
    /></RouterLink>
  </article>
</template>
