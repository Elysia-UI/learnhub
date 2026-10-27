<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCommunity } from '../stores/community';
import { uid } from '../services/storage';
import Icon from '../components/Icon.vue';
const store = useCommunity(),
  activeId = ref(''),
  text = ref(''),
  showGuide = ref(false);
const conversations = computed(() =>
  store.data.conversations.filter((c) => c.userId === store.currentUser?.id),
);
const active = computed(() => conversations.value.find((c) => c.id === activeId.value));
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
watch(
  activeId,
  () => (text.value = active.value?.messages.find((m) => m.role === 'user')?.content || ''),
);
async function newConversation() {
  if (!store.requireUser()) return;
  try {
    const draft = await store.saveConversation('');
    activeId.value = draft.id;
    text.value = '';
  } catch {}
}
async function saveDraft() {
  if (!store.requireUser() || !text.value.trim()) return;
  try {
    const draft = await store.saveConversation(text.value.trim(), active.value?.id);
    activeId.value = draft.id;
  } catch {}
}
function remove(id: string) {
  store.modal = {
    type: 'confirm',
    payload: {
      title: '删除这个学习草稿？',
      content: '确认删除这份学习草稿？删除后无法恢复。',
      onConfirm: async () => {
        await store.deleteConversation(id);
        if (activeId.value === id) activeId.value = '';
      },
    },
  };
}
</script>
<template>
  <div class="ai-workspace">
    <aside class="ai-history">
      <div class="ai-history-heading">
        <Icon name="Bot" :size="21" /><strong>知学 AI</strong
        ><span class="tag tag-purple">BETA</span>
      </div>
      <button class="btn btn-primary full" @click="newConversation">
        <Icon name="Plus" :size="17" />新建学习草稿
      </button>
      <h4>最近的草稿</h4>
      <div class="ai-history-list">
        <div v-for="c in conversations" :key="c.id" :class="{ active: activeId === c.id }">
          <button @click="activeId = c.id">
            <Icon name="MessageSquare" :size="16" /><span>{{ c.title }}</span></button
          ><button class="icon-btn" aria-label="删除草稿" @click="remove(c.id)">
            <Icon name="Trash2" :size="14" />
          </button>
        </div>
        <p v-if="!conversations.length">记录好问题，<br />为下一次学习做好准备。</p>
      </div>
      <div class="ai-privacy">
        <Icon name="LockKeyhole" :size="16" />
        <p>学习草稿已同步到云端<br />尚未连接外部 AI 服务</p>
      </div>
    </aside>
    <section class="ai-main">
      <div class="ai-topline">
        <span><Icon name="Sparkles" :size="17" />你的专属学习伙伴</span
        ><button class="text-link" @click="showGuide = !showGuide">
          <span class="status-dot orange"></span>AI 服务未接入<Icon name="ChevronDown" :size="15" />
        </button>
      </div>
      <div v-if="showGuide" class="ai-connection-guide">
        <Icon name="CircleAlert" :size="22" />
        <div>
          <strong>等待服务端接入</strong>
          <p>
            后续通过服务端配置
            AI_BASE_URL、AI_API_KEY、AI_MODEL，再对接对话接口。密钥应仅保存在服务端，当前页面不会请求任何模型服务。
          </p>
          <p>现在可以选择快捷问题、编辑和保存学习草稿。</p>
        </div>
        <button class="icon-btn" aria-label="关闭配置提示" @click="showGuide = false">
          <Icon name="X" :size="17" />
        </button>
      </div>
      <div class="ai-welcome">
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
      <div class="ai-composer-wrap">
        <div class="ai-composer">
          <textarea
            v-model="text"
            maxlength="12000"
            aria-label="学习问题草稿"
            placeholder="写下你的学习问题，先保存灵感…"
            rows="3"
            @keydown.ctrl.enter.prevent="saveDraft"
          ></textarea>
          <div>
            <span><Icon name="LockKeyhole" :size="14" />云端学习草稿</span
            ><button class="btn btn-primary btn-sm" :disabled="!text.trim()" @click="saveDraft">
              <Icon name="Bookmark" :size="16" />保存草稿
            </button>
          </div>
        </div>
        <p class="ai-bottom-note">
          <Icon name="CircleAlert" :size="13" />AI 服务尚未接入。这里不会生成或展示模拟的 AI 回答。
        </p>
      </div>
    </section>
  </div>
</template>
