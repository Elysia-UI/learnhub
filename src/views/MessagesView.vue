<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCommunity } from '../stores/community';
import { useChat } from '../stores/chat';
import { timeAgo } from '../services/format';
import type { ChatMessage, PendingMessage } from '../services/chat';
import Avatar from '../components/Avatar.vue';
import Icon from '../components/Icon.vue';
import EmptyState from '../components/EmptyState.vue';

const route = useRoute(),
  community = useCommunity(),
  chat = useChat();
const keyword = ref(''),
  feed = ref<HTMLElement>(),
  editor = ref<HTMLTextAreaElement>();
const atBottom = ref(true),
  newMessages = ref(0);
const requestedPeer = computed(() => String(route.params.peerId || ''));
const selected = computed(() => !!requestedPeer.value);
const draftLength = computed(() => chat.draft.length);
let oldLastId = '',
  oldPendingCount = 0;
let positioning = false;

function timestamp(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
function own(message: ChatMessage) {
  return message.senderId === community.currentUser?.id;
}
function updateScroll() {
  if (!feed.value || positioning) return;
  const node = feed.value;
  atBottom.value = node.scrollHeight - node.scrollTop - node.clientHeight < 70;
  if (atBottom.value) newMessages.value = 0;
  chat.setReadingVisible(atBottom.value && !document.hidden);
}
async function bottom(focus = false) {
  await nextTick();
  if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;
  atBottom.value = true;
  newMessages.value = 0;
  chat.setReadingVisible(!document.hidden);
  if (focus) editor.value?.focus();
}
async function loadOlder() {
  if (!feed.value) return;
  const height = feed.value.scrollHeight,
    top = feed.value.scrollTop;
  positioning = true;
  chat.setReadingVisible(false);
  try {
    await chat.loadOlder();
    await nextTick();
    if (feed.value) feed.value.scrollTop = top + feed.value.scrollHeight - height;
  } finally {
    positioning = false;
    updateScroll();
  }
}
async function send() {
  const text = chat.draft.trim();
  if (!text || chat.sending || !chat.canSend || text.length > 2000) return;
  const promise = chat.sendMessage(text);
  chat.draft = '';
  void bottom(true);
  await promise;
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void send();
  }
}
function retry(row: PendingMessage) {
  void chat.retryMessage(row.clientId);
}
function resetSelection() {
  oldLastId = '';
  oldPendingCount = 0;
  newMessages.value = 0;
  atBottom.value = true;
  void chat.activate(requestedPeer.value);
}
watch([requestedPeer, () => community.currentUser?.id], resetSelection, { immediate: true });
watch(
  () => chat.messageLoading,
  async (loading, old) => {
    if (old && !loading && chat.peer) {
      oldLastId = chat.messages.at(-1)?.id || '';
      await bottom();
    }
  },
);
watch([() => chat.messages, () => chat.pendingMessages.length], async () => {
  if (positioning || chat.messageLoading || !selected.value) return;
  const last = chat.messages.at(-1),
    lastId = last?.id || '';
  const newTail = !!lastId && lastId !== oldLastId;
  const pendingAdded = chat.pendingMessages.length > oldPendingCount;
  oldLastId = lastId;
  oldPendingCount = chat.pendingMessages.length;
  if (atBottom.value || (newTail && last?.senderId === community.currentUser?.id) || pendingAdded) {
    await bottom();
  } else if (newTail && last?.senderId !== community.currentUser?.id) newMessages.value++;
});
function visible() {
  if (!document.hidden && selected.value && atBottom.value) chat.setReadingVisible(true);
  else chat.setReadingVisible(false);
}
onMounted(() => {
  chat.setThreadViewMounted(true);
  document.addEventListener('visibilitychange', visible);
});
onUnmounted(() => {
  document.removeEventListener('visibilitychange', visible);
  chat.setThreadViewMounted(false);
});
</script>

<template>
  <div class="full-page messages-page">
    <div class="messages-intro">
      <div>
        <span class="eyebrow">KEEP IN TOUCH / 好友聊天</span>
        <h1>和学习伙伴，聊聊新发现<span class="title-dot">.</span></h1>
      </div>
      <RouterLink to="/connections?type=friends" class="btn btn-secondary btn-sm"
        ><Icon name="UsersRound" :size="16" />我的好友</RouterLink
      >
    </div>
    <section v-if="!community.currentUser" class="panel">
      <EmptyState
        title="登录后和好友聊天"
        description="互相关注后，就能在这里继续交流。"
        icon="MessagesSquare"
        ><button class="btn btn-primary" @click="community.requireUser()">
          登录社区
        </button></EmptyState
      >
    </section>
    <section
      v-else
      class="panel messenger"
      :class="{ 'peer-selected': selected }"
      aria-label="好友私聊"
    >
      <aside class="thread-sidebar" aria-label="最近会话">
        <header class="thread-header">
          <div>
            <h2>
              最近会话<span v-if="chat.unreadCount" class="count-pill">{{
                chat.unreadCount > 99 ? '99+' : chat.unreadCount
              }}</span>
            </h2>
            <small>只与你的互关好友开启新对话</small>
          </div>
          <button
            class="icon-btn"
            aria-label="刷新会话"
            :disabled="chat.threadLoading"
            @click="chat.loadThreads()"
          >
            <Icon name="RotateCcw" :size="17" :class="{ spin: chat.threadLoading }" />
          </button>
        </header>
        <form class="thread-search" @submit.prevent="chat.setSearch(keyword)">
          <Icon name="Search" :size="16" /><input
            v-model="keyword"
            aria-label="搜索聊天好友"
            placeholder="搜索好友昵称"
            maxlength="100"
          /><button type="submit" class="text-link">搜索</button>
        </form>
        <p v-if="chat.threadError" class="chat-error thread-error" role="alert">
          {{ chat.threadError }}<button class="text-link" @click="chat.loadThreads()">重试</button>
        </p>
        <div class="thread-list">
          <RouterLink
            v-for="thread in chat.threads"
            :key="thread.peer.id"
            :to="'/messages/' + thread.peer.id"
            class="thread-item"
            :class="{ active: chat.activePeerId === thread.peer.id }"
          >
            <span class="thread-avatar"
              ><Avatar :user="thread.peer" :size="43" /><i
                v-if="thread.unreadCount"
                class="thread-unread"
                >{{ thread.unreadCount > 99 ? '99+' : thread.unreadCount }}</i
              ></span
            >
            <span class="thread-copy"
              ><span class="thread-title"
                ><strong>{{ thread.peer.name }}</strong
                ><time>{{ timeAgo(thread.lastMessage.createdAt) }}</time></span
              ><span class="thread-preview"
                >{{ thread.lastMessage.senderId === community.currentUser.id ? '我：' : ''
                }}{{ thread.lastMessage.content }}</span
              ><small v-if="!thread.canSend" class="thread-readonly">历史记录 · 只读</small></span
            >
          </RouterLink>
          <p v-if="chat.threadLoading" class="chat-loading" role="status">正在读取会话…</p>
          <div v-else-if="!chat.threads.length && !chat.threadError" class="thread-empty">
            <Icon name="MessagesSquare" :size="30" />
            <p>{{ chat.search ? '没有找到相关会话' : '还没有聊天记录' }}</p>
            <RouterLink to="/connections?type=friends" class="text-link"
              >选择一位好友，开始交流</RouterLink
            >
          </div>
          <button
            v-if="chat.hasMoreThreads"
            class="thread-more text-link"
            :disabled="chat.threadLoading"
            @click="chat.loadThreads(true)"
          >
            加载更多会话
          </button>
        </div>
        <footer class="connection-state" :class="{ reconnecting: !chat.connected }">
          <i></i
          ><span>{{
            chat.connected ? '消息实时更新已连接' : chat.connectionError || '正在连接消息服务…'
          }}</span
          ><button v-if="chat.connectionError" class="text-link" @click="chat.sync()">刷新</button>
        </footer>
      </aside>

      <div v-if="!selected" class="chat-welcome">
        <span class="welcome-mark"><Icon name="MessagesSquare" :size="42" /></span>
        <h2>从一句问候开始</h2>
        <p>选择左侧会话，或去好友列表开启新对话。<br />这里记录你们的学习交流。</p>
        <RouterLink to="/connections?type=friends" class="btn btn-primary"
          ><Icon name="UsersRound" :size="17" />找好友聊聊</RouterLink
        >
      </div>
      <section v-else class="conversation" aria-label="当前对话">
        <header class="conversation-header">
          <RouterLink to="/messages" class="icon-btn conversation-back" aria-label="返回会话列表"
            ><Icon name="ChevronLeft" :size="21"
          /></RouterLink>
          <RouterLink v-if="chat.peer" :to="'/members/' + chat.peer.id" class="conversation-peer"
            ><Avatar :user="chat.peer" :size="39" /><span
              ><strong>{{ chat.peer.name }}</strong
              ><small>{{
                chat.canSend
                  ? '互关好友'
                  : chat.peer.status === 'banned'
                    ? '该账号暂不可用 · 历史只读'
                    : '好友关系已解除 · 历史只读'
              }}</small></span
            ></RouterLink
          >
          <div v-else class="conversation-peer-placeholder">
            <strong>{{ chat.messageLoading ? '正在读取对话…' : '好友聊天' }}</strong>
          </div>
          <button
            class="icon-btn"
            aria-label="刷新当前聊天"
            :disabled="chat.messageLoading"
            @click="chat.peer ? chat.refreshActive() : chat.activate(requestedPeer)"
          >
            <Icon name="RotateCcw" :size="17" :class="{ spin: chat.messageLoading }" />
          </button>
        </header>
        <p v-if="chat.connectionError" class="conversation-connection" role="status">
          <Icon name="CircleAlert" :size="14" />{{ chat.connectionError }}
        </p>
        <div v-if="chat.messageError" class="chat-error conversation-error" role="alert">
          <span>{{ chat.messageError }}</span
          ><button
            class="text-link"
            @click="chat.peer ? chat.refreshActive() : chat.activate(requestedPeer)"
          >
            重试读取
          </button>
        </div>
        <div v-if="chat.messageLoading" class="conversation-loading" role="status">
          <Icon name="LoaderCircle" class="spin" :size="26" />
          <p>正在读取聊天记录…</p>
        </div>
        <div v-else-if="!chat.peer" class="conversation-unavailable">
          <EmptyState
            title="暂时无法打开这段对话"
            :description="chat.messageError || '互相关注后可以开始聊天。'"
            icon="LockKeyhole"
            ><RouterLink :to="'/members/' + requestedPeer" class="btn btn-secondary"
              >查看对方主页</RouterLink
            ></EmptyState
          >
        </div>
        <template v-else>
          <div
            ref="feed"
            class="message-feed"
            role="log"
            aria-label="聊天记录"
            aria-live="polite"
            :aria-busy="chat.olderLoading"
            @scroll="updateScroll"
          >
            <button
              v-if="chat.hasOlder"
              class="older-button text-link"
              :disabled="chat.olderLoading"
              @click="loadOlder"
            >
              <Icon
                :name="chat.olderLoading ? 'LoaderCircle' : 'Clock3'"
                :class="{ spin: chat.olderLoading }"
                :size="14"
              />{{ chat.olderLoading ? '正在读取更早消息…' : '查看更早消息' }}
            </button>
            <p v-else-if="chat.messages.length" class="history-start">这是你们这段交流的开始</p>
            <div
              v-if="!chat.messages.length && !chat.pendingMessages.length"
              class="new-conversation"
            >
              <Icon name="MessagesSquare" :size="32" />
              <p>{{ chat.canSend ? '你们已经互相关注，打个招呼吧。' : '这里还没有聊天记录。' }}</p>
            </div>
            <article
              v-for="message in chat.messages"
              :key="message.id"
              class="message-row"
              :class="{ own: own(message) }"
              :data-message-id="message.id"
            >
              <Avatar :user="own(message) ? community.currentUser : chat.peer" :size="32" />
              <div class="message-content">
                <p class="message-bubble">{{ message.content }}</p>
                <span class="message-meta"
                  ><time :datetime="message.createdAt">{{ timestamp(message.createdAt) }}</time
                  ><span
                    v-if="own(message)"
                    class="read-status"
                    :class="{ read: chat.isRead(message) }"
                    ><Icon :name="chat.isRead(message) ? 'CheckCheck' : 'Check'" :size="12" />{{
                      chat.isRead(message) ? '已读' : '未读'
                    }}</span
                  ></span
                >
              </div>
            </article>
            <article
              v-for="pending in chat.pendingMessages"
              :key="pending.clientId"
              class="message-row own pending-message"
              :class="{ failed: pending.status === 'failed' }"
            >
              <Avatar :user="community.currentUser" :size="32" />
              <div class="message-content">
                <p class="message-bubble">{{ pending.content }}</p>
                <span v-if="pending.status === 'sending'" class="message-meta"
                  ><Icon name="LoaderCircle" class="spin" :size="12" />发送中…</span
                ><span v-else class="pending-error" role="alert"
                  ><span>{{ pending.error }}</span
                  ><button class="text-link" @click="retry(pending)">
                    <Icon name="RotateCcw" :size="12" />重试发送
                  </button></span
                >
              </div>
            </article>
          </div>
          <button v-if="newMessages" class="new-message-jump" @click="bottom()">
            <Icon name="ChevronDown" :size="15" />有新消息，点击查看
          </button>
          <div v-if="!chat.canSend" class="readonly-note">
            <Icon name="LockKeyhole" :size="17" /><span>{{
              chat.peer.status === 'banned'
                ? '对方账号暂不可用，历史消息仍可查看。'
                : '你们目前没有互相关注，历史消息仍可查看。'
            }}</span
            ><RouterLink
              v-if="chat.peer.status === 'active'"
              :to="'/members/' + chat.peer.id"
              class="text-link"
              >查看主页</RouterLink
            >
          </div>
          <form v-else class="message-composer" @submit.prevent="send">
            <label class="sr-only" for="friend-message">给好友发消息</label
            ><textarea
              id="friend-message"
              ref="editor"
              v-model="chat.draft"
              placeholder="分享想法，或问候一下好友…"
              rows="3"
              maxlength="2000"
              @keydown="keydown"
            ></textarea>
            <div class="composer-bottom">
              <span>Enter 发送 · Shift + Enter 换行</span>
              <div>
                <span>{{ draftLength }}/2000</span
                ><button
                  type="submit"
                  class="btn btn-primary btn-sm"
                  :disabled="chat.sending || !chat.draft.trim() || draftLength > 2000"
                >
                  <Icon
                    :name="chat.sending ? 'LoaderCircle' : 'Send'"
                    :class="{ spin: chat.sending }"
                    :size="16"
                  />{{ chat.sending ? '发送中' : '发送' }}
                </button>
              </div>
            </div>
          </form>
        </template>
      </section>
    </section>
  </div>
</template>

<style scoped>
.messages-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 20px;
}
.messages-intro h1 {
  font-size: 24px;
  margin: 5px 0 0;
  letter-spacing: -0.4px;
}
.messenger {
  display: flex;
  height: calc(100dvh - 185px);
  min-height: 520px;
  max-height: 850px;
  overflow: hidden;
  padding: 0;
}
.thread-sidebar {
  width: 294px;
  flex: 0 0 294px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  min-width: 0;
}
.thread-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 21px 18px 12px;
  gap: 8px;
}
.thread-header h2 {
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.thread-header small {
  font-size: 10px;
  color: var(--muted);
}
.count-pill {
  font-size: 10px;
  background: var(--primary);
  color: white;
  border-radius: 12px;
  padding: 1px 7px;
}
.thread-search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 16px 13px;
  padding: 8px 9px;
  border: 1px solid var(--border);
  border-radius: 9px;
  color: var(--muted);
}
.thread-search input {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  outline: none;
  font-size: 11px;
}
.thread-search button {
  white-space: nowrap;
  font-size: 10px;
}
.thread-list {
  overflow-y: auto;
  min-height: 0;
  flex: 1;
  padding: 0 8px;
}
.thread-item {
  display: flex;
  gap: 10px;
  padding: 14px 10px;
  border-radius: 10px;
  margin-bottom: 3px;
  align-items: center;
}
.thread-item:hover,
.thread-item.active {
  background: var(--hover);
}
.thread-avatar {
  position: relative;
  flex-shrink: 0;
}
.thread-unread {
  position: absolute;
  right: -4px;
  top: -4px;
  min-width: 17px;
  height: 17px;
  border: 2px solid var(--card);
  background: #f06b88;
  color: white;
  border-radius: 12px;
  font-size: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  font-style: normal;
}
.thread-copy {
  min-width: 0;
  flex: 1;
}
.thread-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  justify-content: space-between;
}
.thread-title strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.thread-title time {
  flex-shrink: 0;
  font-size: 9px;
  color: var(--muted);
}
.thread-preview {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--subtle);
  margin-top: 4px;
}
.thread-readonly {
  display: block;
  color: var(--muted);
  font-size: 9px;
  margin-top: 3px;
}
.thread-more {
  width: 100%;
  padding: 14px;
  text-align: center;
  font-size: 11px;
}
.thread-empty {
  text-align: center;
  padding: 42px 12px;
  color: var(--muted);
}
.thread-empty > svg {
  color: var(--primary);
  opacity: 0.55;
}
.thread-empty p {
  font-size: 12px;
  margin: 12px 0 8px;
}
.thread-empty a {
  font-size: 11px;
}
.connection-state {
  border-top: 1px solid var(--border);
  padding: 13px 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--muted);
  line-height: 1.6;
}
.connection-state > i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3bbd9a;
  flex-shrink: 0;
}
.connection-state.reconnecting > i {
  background: #e7ae55;
}
.connection-state > span {
  flex: 1;
}
.chat-welcome {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 30px;
}
.welcome-mark {
  width: 92px;
  height: 92px;
  display: grid;
  place-items: center;
  background: var(--hover);
  border-radius: 26px;
  color: var(--primary);
  margin-bottom: 23px;
}
.chat-welcome h2 {
  font-size: 22px;
}
.chat-welcome p {
  margin: 12px 0 23px;
  font-size: 12px;
  line-height: 2;
  color: var(--subtle);
}
.conversation {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.conversation-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 17px 23px;
  border-bottom: 1px solid var(--border);
  min-height: 76px;
}
.conversation-header > .icon-btn:last-child {
  margin-left: auto;
}
.conversation-peer {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.conversation-peer strong {
  display: block;
  font-size: 14px;
}
.conversation-peer small {
  display: block;
  font-size: 10px;
  color: var(--muted);
  margin-top: 2px;
}
.conversation-back {
  display: none;
}
.conversation-connection {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 10px;
  background: var(--soft);
  color: var(--subtle);
  font-size: 10px;
  margin: 0;
}
.chat-error {
  color: #d8506d;
  font-size: 11px;
  line-height: 1.7;
}
.thread-error {
  padding: 6px 17px 12px;
}
.chat-error button {
  margin-left: 7px;
  white-space: nowrap;
}
.conversation-error {
  padding: 9px 18px;
  background: var(--soft);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.conversation-loading,
.conversation-unavailable {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: var(--muted);
}
.conversation-loading p {
  margin-top: 10px;
  font-size: 12px;
}
.message-feed {
  overflow-y: auto;
  overscroll-behavior: contain;
  flex: 1;
  min-height: 0;
  padding: 17px 23px 22px;
  background: var(--soft);
  scrollbar-gutter: stable;
}
.older-button {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 auto 20px;
  font-size: 11px;
  padding: 5px 8px;
}
.history-start {
  text-align: center;
  color: var(--muted);
  font-size: 10px;
  margin: 0 0 20px;
}
.new-conversation {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-height: 140px;
  color: var(--muted);
  font-size: 12px;
  gap: 12px;
}
.message-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 19px;
}
.message-row > .avatar {
  flex-shrink: 0;
}
.message-content {
  max-width: min(78%, 600px);
  min-width: 0;
}
.message-bubble {
  margin: 0;
  padding: 11px 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.85;
  border-radius: 2px 13px 13px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  font-size: 12px;
}
.message-row.own {
  flex-direction: row-reverse;
}
.own .message-bubble {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
  border-radius: 13px 2px 13px 13px;
}
.message-meta {
  margin-top: 5px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 9px;
  line-height: 1.7;
  color: var(--muted);
}
.own .message-meta {
  justify-content: flex-end;
}
.read-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.read-status.read {
  color: var(--primary);
}
.pending-message .message-bubble {
  opacity: 0.75;
}
.pending-message.failed .message-bubble {
  border-color: #ec7d94;
}
.pending-error {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  font-size: 10px;
  color: #d8506d;
  margin-top: 5px;
}
.pending-error button {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}
.new-message-jump {
  position: absolute;
  bottom: 165px;
  right: 25px;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: 0 4px 18px #14203e12;
  border-radius: 18px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 13px;
  font-size: 11px;
  color: var(--primary);
  z-index: 2;
}
.message-composer {
  border-top: 1px solid var(--border);
  padding: 15px 20px 13px;
}
.message-composer textarea {
  width: 100%;
  resize: none;
  border: 0;
  padding: 0;
  background: transparent;
  outline: none;
  box-shadow: none;
  font-size: 12px;
  line-height: 1.8;
  min-height: 67px;
  max-height: 120px;
}
.composer-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  color: var(--muted);
  font-size: 10px;
}
.composer-bottom > div {
  display: flex;
  align-items: center;
  gap: 12px;
}
.composer-bottom .btn {
  min-width: 82px;
}
.readonly-note {
  padding: 18px 22px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--subtle);
  font-size: 11px;
  line-height: 1.8;
}
.readonly-note > svg {
  flex-shrink: 0;
}
.readonly-note a {
  margin-left: auto;
  white-space: nowrap;
}
.chat-loading {
  color: var(--muted);
  text-align: center;
  font-size: 11px;
  padding: 18px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 1100px) {
  .thread-sidebar {
    width: 260px;
    flex-basis: 260px;
  }
  .message-feed {
    padding-left: 17px;
    padding-right: 17px;
  }
  .conversation-header {
    padding-left: 17px;
    padding-right: 17px;
  }
}
@media (max-width: 760px) {
  .messages-intro {
    margin-bottom: 14px;
  }
  .messages-intro h1 {
    font-size: 19px;
  }
  .messages-intro .eyebrow {
    font-size: 9px;
  }
  .messages-intro > a {
    font-size: 11px;
    white-space: nowrap;
  }
  .messenger {
    height: calc(100dvh - 190px);
    min-height: 430px;
    max-height: none;
  }
  .thread-sidebar {
    width: 100%;
    flex-basis: 100%;
    border-right: 0;
  }
  .chat-welcome {
    display: none;
  }
  .conversation {
    display: none;
  }
  .peer-selected .thread-sidebar {
    display: none;
  }
  .peer-selected .conversation {
    display: flex;
  }
  .conversation-back {
    display: flex;
  }
  .conversation-header {
    padding: 13px 12px;
    gap: 8px;
    min-height: 69px;
  }
  .conversation-peer strong {
    font-size: 13px;
  }
  .message-feed {
    padding: 14px 12px;
  }
  .message-content {
    max-width: 80%;
  }
  .message-bubble {
    font-size: 12px;
    padding: 9px 12px;
  }
  .message-composer {
    padding: 12px 13px;
  }
  .composer-bottom > span {
    display: none;
  }
  .composer-bottom {
    justify-content: flex-end;
  }
  .readonly-note {
    padding: 14px 13px;
    flex-wrap: wrap;
  }
  .new-message-jump {
    right: 15px;
    bottom: 154px;
  }
  .thread-header {
    padding-top: 18px;
  }
}
@media (max-width: 430px) {
  .messages-intro h1 {
    font-size: 16px;
  }
  .messages-intro .eyebrow {
    display: none;
  }
  .messages-intro > a {
    padding: 8px 10px;
  }
  .messenger {
    height: calc(100dvh - 160px);
    min-height: 390px;
  }
  .message-row {
    gap: 7px;
  }
  .message-meta {
    font-size: 9px;
  }
}
</style>
