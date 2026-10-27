<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCommunity } from '../stores/community';
import { timeAgo } from '../services/format';
import Icon from '../components/Icon.vue';
import EmptyState from '../components/EmptyState.vue';
const store = useCommunity(),
  filter = ref('全部消息');
const notifications = computed(() =>
  store.data.notifications.filter(
    (n) => n.userId === store.currentUser?.id && (filter.value !== '未读消息' || !n.read),
  ),
);
function remove(id: string) {
  void store.deleteNotification(id);
}
</script>
<template>
  <div class="narrow-page">
    <div class="page-intro">
      <div>
        <div class="eyebrow">STAY CONNECTED / 消息中心</div>
        <h1>每一次互动，都有回响<span class="title-dot">.</span></h1>
        <p>来自学习伙伴的消息，都在这里。</p>
      </div>
      <button class="btn btn-secondary" @click="store.markRead()">
        <Icon name="CheckCheck" :size="17" />全部已读
      </button>
    </div>
    <section class="panel notifications-panel">
      <div class="line-tabs">
        <button
          v-for="f in ['全部消息', '未读消息']"
          :key="f"
          :class="{ active: filter === f }"
          @click="filter = f"
        >
          {{ f }}<span v-if="f === '未读消息' && store.unread">{{ store.unread }}</span>
        </button>
      </div>
      <div
        v-for="n in notifications"
        :key="n.id"
        class="notification-row"
        :class="{ unread: !n.read }"
      >
        <span class="notice-large-icon"
          ><Icon
            :name="
              n.type === 'system'
                ? 'Bell'
                : n.type === 'like'
                  ? 'Heart'
                  : n.type === 'accepted'
                    ? 'CheckCircle2'
                    : 'MessagesSquare'
            "
            :size="23" /></span
        ><RouterLink :to="n.link || '/announcements'" @click="store.markRead(n.id)"
          ><h3>{{ n.title }}<i v-if="!n.read" class="unread-dot"></i></h3>
          <p>{{ n.content }}</p>
          <time>{{ timeAgo(n.createdAt) }}</time></RouterLink
        >
        <div>
          <button
            v-if="!n.read"
            class="icon-btn"
            aria-label="标记为已读"
            @click="store.markRead(n.id)"
          >
            <Icon name="CheckCheck" :size="18" /></button
          ><button class="icon-btn" aria-label="删除通知" @click="remove(n.id)">
            <Icon name="Trash2" :size="17" />
          </button>
        </div>
      </div>
      <EmptyState
        v-if="!notifications.length"
        title="所有好消息，都会如期而至"
        description="现在没有待查看的消息，去社区逛逛吧。"
        icon="Bell"
      />
    </section>
  </div>
</template>
