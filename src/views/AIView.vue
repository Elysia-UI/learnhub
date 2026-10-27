<script setup lang="ts">
import { computed, ref, watch, onUnmounted, nextTick } from 'vue';
import { useCommunity } from '../stores/community';
import { api, streamChat } from '../services/api';
import { usePaged } from '../services/paged';
import Markdown from '../components/Markdown.vue';
import Pagination from '../components/Pagination.vue';
import Icon from '../components/Icon.vue';
const store = useCommunity(),
  activeId = ref(''),
  text = ref(''),
  showGuide = ref(false),
  busy = ref(false),
  error = ref(''),
  configured = ref(false),
  configMessage = ref('正在检查模型配置…'),
  messages = ref<any[]>([]),
  feed = ref<HTMLElement>(),
  mode = ref<'chat' | 'draft'>('chat');
const {
  items: chatHistory,
  total,
  page,
  load: loadHistory,
  error: historyError,
} = usePaged<any>(
  () => (store.currentUser ? '/ai/conversations' : ''),
  [() => store.currentUser?.id],
);
const conversations = computed(() =>
  mode.value === 'chat'
    ? chatHistory.value
    : store.data.conversations.filter((c) => c.kind !== 'chat'),
);
const prompts = [
  {
    icon: 'BookOpen',
    title: '解释一个知识点',
    text: '请用通俗的例子解释 Vue 3 的响应式原理。',
    color: 'blue',
  },
  {
    icon: 'CalendarDays',
    title: '制定学习计划',
    text: '我每天有 1 小时，想在一个月内掌握 JavaScript 基础，请帮我制定学习计划。',
    color: 'purple',
  },
  {
    icon: 'FileText',
    title: '梳理学习笔记',
    text: '请帮我将以下学习内容整理成结构清晰的笔记：',
    color: 'teal',
  },
  {
    icon: 'Code2',
    title: '一起分析代码',
    text: '请帮我理解下面代码的运行逻辑，并说明可能的问题：',
    color: 'orange',
  },
];

let controller: AbortController | undefined;
async function status() {
  try {
    const r = await api<{ configured: boolean; message: string }>('/ai/status');
    configured.value = r.configured;
    configMessage.value = r.message;
  } catch (e) {
    configMessage.value = (e as Error).message;
  }
}
void status();
async function select(id: string) {
  if (busy.value) return;
  activeId.value = id;
  error.value = '';
  try {
    if (mode.value === 'chat') {
      const r = await api<{ messages: any[] }>('/ai/conversations/' + id);
      messages.value = r.messages;
      text.value = '';
    } else {
      text.value = store.data.conversations.find((c) => c.id === id)?.messages[0]?.content || '';
      messages.value = [];
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function newConversation() {
  if (busy.value) return;
  activeId.value = '';
  messages.value = [];
  text.value = '';
  error.value = '';
}
watch(mode, newConversation);
watch(
  () => store.sessionId,
  () => {
    newConversation();
  },
);
async function saveDraft() {
  if (!store.requireUser() || !text.value.trim()) return;
  const content = text.value.trim();
  try {
    const r = await store.saveConversation(
      text.value.trim(),
      mode.value === 'draft' ? activeId.value || undefined : undefined,
    );
    mode.value = 'draft';
    await nextTick();
    activeId.value = r.id;
    text.value = content;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function send(retry = false) {
  if (busy.value || !store.requireUser()) return;
  if (!configured.value) {
    showGuide.value = true;
    return;
  }
  const last = messages.value.at(-1),
    previous = [...messages.value].reverse().find((m) => m.role === 'user');
  const content = retry ? previous?.content : text.value.trim(),
    requestKey = retry ? last?.requestKey : crypto.randomUUID();
  if (!content) return;
  if (mode.value === 'draft') {
    activeId.value = '';
    messages.value = [];
  }
  busy.value = true;
  error.value = '';
  controller = new AbortController();
  const uid = store.sessionId;
  try {
    mode.value = 'chat';
    if (!activeId.value) {
      const r = await api<{ id: string }>('/ai/conversations', { method: 'POST', body: {} });
      activeId.value = r.id;
    }
    if (retry) messages.value.pop();
    else {
      messages.value.push({ role: 'user', content, requestKey, status: 'complete' });
      text.value = '';
    }
    const answer = { role: 'assistant', content: '', requestKey, status: 'pending', error: '' };
    messages.value.push(answer);
    await nextTick();
    await streamChat(
      activeId.value,
      { content, requestKey },
      (event) => {
        const m = messages.value.at(-1);
        if (event.type === 'delta' && m) {
          m.content += event.content;
          void nextTick(() =>
            feed.value?.scrollTo({ top: feed.value.scrollHeight, behavior: 'smooth' }),
          );
        }
      },
      controller.signal,
    );
  } catch (e) {
    if (!controller?.signal.aborted) error.value = (e as Error).message;
  } finally {
    busy.value = false;
    if (store.sessionId === uid && activeId.value) {
      const failure = error.value;
      await select(activeId.value);
      if (controller.signal.aborted && messages.value.at(-1)?.status === 'pending') {
        for (let i = 0; i < 5 && messages.value.at(-1)?.status === 'pending'; i++) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          await select(activeId.value);
        }
      }
      if (failure) error.value = failure;
      await loadHistory();
    }
  }
}
function stop() {
  controller?.abort();
  if (activeId.value)
    void api('/ai/conversations/' + activeId.value + '/stop', { method: 'POST' }).catch(() => {});
}
function remove(id: string) {
  if (busy.value) return;
  store.modal = {
    type: 'confirm',
    payload: {
      title: '删除这条学习记录？',
      content: '删除后无法恢复。',
      onConfirm: async () => {
        if (mode.value === 'chat') {
          await api('/ai/conversations/' + id, { method: 'DELETE' });
          await loadHistory();
        } else await store.deleteConversation(id);
        if (activeId.value === id) newConversation();
      },
    },
  };
}
onUnmounted(() => controller?.abort());
</script>
<template>
  <div class="ai-workspace">
    <aside class="ai-history">
      <div class="ai-history-heading">
        <Icon name="Bot" :size="21" /><strong>知学 AI</strong
        ><span class="tag tag-purple">BETA</span>
      </div>
      <button class="btn btn-primary full" @click="newConversation">
        <Icon name="Plus" :size="17" />新建学习对话
      </button>
      <div class="line-tabs">
        <button :class="{ active: mode === 'chat' }" :disabled="busy" @click="mode = 'chat'">
          对话</button
        ><button :class="{ active: mode === 'draft' }" :disabled="busy" @click="mode = 'draft'">
          草稿
        </button>
      </div>
      <div class="ai-history-list">
        <div v-for="c in conversations" :key="c.id" :class="{ active: activeId === c.id }">
          <button @click="select(c.id)">
            <Icon name="MessageSquare" :size="16" /><span>{{ c.title }}</span></button
          ><button class="icon-btn" aria-label="删除草稿" @click="remove(c.id)">
            <Icon name="Trash2" :size="14" />
          </button>
        </div>
        <p v-if="!conversations.length">记录好问题，<br />为下一次学习做好准备。</p>
        <Pagination v-if="mode === 'chat'" v-model="page" :total="total" />
        <p v-if="historyError" class="form-error">{{ historyError }}</p>
      </div>
      <div class="ai-privacy">
        <Icon name="LockKeyhole" :size="16" />
        <p>对话与草稿保存到云数据库<br />模型密钥仅保存在服务端</p>
      </div>
    </aside>
    <section class="ai-main">
      <div class="ai-topline">
        <span><Icon name="Sparkles" :size="17" />你的专属学习伙伴</span
        ><button class="text-link" @click="showGuide = !showGuide">
          <span class="status-dot orange"></span>{{ configured ? '模型服务已配置' : '需要配置模型'
          }}<Icon name="ChevronDown" :size="15" />
        </button>
      </div>
      <div v-if="showGuide" class="ai-connection-guide">
        <Icon name="CircleAlert" :size="22" />
        <div>
          <strong>{{ configured ? '服务状态' : '配置模型服务' }}</strong>
          <p>
            {{ configMessage }}
          </p>
          <p>未配置时仍可以编辑并保存学习草稿。</p>
        </div>
        <button class="icon-btn" aria-label="关闭配置提示" @click="showGuide = false">
          <Icon name="X" :size="17" />
        </button>
      </div>
      <div v-if="!messages.length" class="ai-welcome">
        <div class="ai-emblem"><Icon name="Sparkles" :size="38" :stroke="1.5" /><i></i></div>
        <span class="eyebrow">YOUR LEARNING COMPANION</span>
        <h1>你好，{{ store.currentUser?.name || '新朋友' }}<br />今天想探索什么？</h1>
        <p>从一个问题开始，让复杂的知识变得清晰。</p>
        <div class="prompt-grid">
          <button v-for="p in prompts" :key="p.title" @click="text = p.text">
            <span :class="p.color"><Icon :name="p.icon" :size="21" /></span
            ><strong>{{ p.title }}</strong
            ><Icon name="ArrowUpRight" :size="17" />
          </button>
        </div>
      </div>
      <div v-else ref="feed" class="ai-message-list" aria-live="polite">
        <article v-for="(m, i) in messages" :key="m.id || i" class="ai-message" :class="m.role">
          <strong>{{ m.role === 'user' ? store.currentUser?.name : '知学 AI' }}</strong
          ><Markdown :content="m.content || (busy ? '正在思考…' : '')" />
          <p v-if="m.error" class="form-error">{{ m.error }}</p>
          <button
            v-if="i === messages.length - 1 && ['failed', 'cancelled'].includes(m.status) && !busy"
            class="text-link"
            @click="send(true)"
          >
            重试这条消息
          </button>
        </article>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="ai-composer-wrap">
        <div class="ai-composer">
          <textarea
            v-model="text"
            maxlength="12000"
            aria-label="学习问题草稿"
            placeholder="写下你的学习问题，Ctrl + Enter 发送…"
            rows="3"
            @keydown.ctrl.enter.prevent="send()"
          ></textarea>
          <div>
            <span><Icon name="LockKeyhole" :size="14" />云端学习草稿</span
            ><button
              class="btn btn-secondary btn-sm"
              :disabled="busy || !text.trim()"
              @click="saveDraft"
            >
              <Icon name="Bookmark" :size="16" />保存草稿</button
            ><button v-if="busy" class="btn btn-secondary btn-sm" @click="stop">停止生成</button
            ><button v-else class="btn btn-primary btn-sm" :disabled="!text.trim()" @click="send()">
              <Icon name="Send" :size="16" />发送
            </button>
          </div>
        </div>
        <p class="ai-bottom-note">
          <Icon name="CircleAlert" :size="13" />{{
            configured
              ? 'AI 回答仅供学习参考，请核对重要信息。每分钟最多 10 条，每日最多 100 条。'
              : '尚未配置模型服务，可以先保存学习草稿。'
          }}
        </p>
      </div>
    </section>
  </div>
</template>
