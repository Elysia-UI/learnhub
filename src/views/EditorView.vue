<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCommunity } from '../stores/community';
import { readUpload } from '../services/files';
import { api } from '../services/api';
import Icon from '../components/Icon.vue';
import Markdown from '../components/Markdown.vue';
import EmptyState from '../components/EmptyState.vue';
const store = useCommunity(),
  route = useRoute(),
  router = useRouter();
const original = ref(store.data.posts.find((p) => p.id === route.params.id));
const title = ref(original.value?.title || ''),
  content = ref(original.value?.content || ''),
  category = ref(original.value?.category || 'tech'),
  type = ref(original.value?.type || '讨论'),
  tags = ref(original.value?.tags.join('，') || ''),
  image = ref(original.value?.image || ''),
  preview = ref(false),
  error = ref(''),
  editor = ref<HTMLTextAreaElement>(),
  busy = ref(false);
const authorized = computed(
  () =>
    store.currentUser &&
    (!original.value ||
      original.value.authorId === store.currentUser.id ||
      store.currentUser.role === 'admin'),
);
const draftKey = computed(
  () => `learnhub.draft.${store.currentUser?.id}.${original.value?.id || 'new'}`,
);
function saveDraft() {
  localStorage.setItem(
    draftKey.value,
    JSON.stringify({
      title: title.value,
      content: content.value,
      category: category.value,
      type: type.value,
      tags: tags.value,
      image: image.value,
    }),
  );
  store.notify('草稿已保存在当前浏览器');
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey.value) || 'null');
    if (!d) return store.notify('还没有保存的草稿');
    title.value = d.title;
    content.value = d.content;
    category.value = d.category;
    type.value = d.type;
    tags.value = d.tags;
    image.value = d.image || '';
    store.notify('已恢复草稿');
  } catch {
    store.notify('草稿读取失败', 'error');
  }
}
function insert(before: string, after = '') {
  const el = editor.value;
  if (!el) return;
  const start = el.selectionStart,
    end = el.selectionEnd;
  content.value =
    content.value.slice(0, start) +
    before +
    (content.value.slice(start, end) || '在这里输入') +
    after +
    content.value.slice(end);
  el.focus();
}
async function upload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  busy.value = true;
  try {
    const data = (await store.uploadAvatar(file)).url;

    image.value = data;
    store.notify('图片已附加');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function submit() {
  error.value = '';
  if (title.value.trim().length < 6) return (error.value = '标题至少需要 6 个字');
  if (content.value.trim().length < 20)
    return (error.value = '正文至少需要 20 个字，让分享更有价值');
  try {
    const id = await store.savePost(
      {
        title: title.value.trim(),
        content: content.value.trim(),
        category: category.value,
        type: type.value,
        tags: tags.value
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 5),
        image: image.value || undefined,
      },
      original.value?.id,
    );
    if (id) {
      localStorage.removeItem(draftKey.value);
      router.push(`/forum/${id}`);
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}
const editorLoading = ref(false);
watch(
  () => route.params.id,
  async (id) => {
    if (!id) return;
    editorLoading.value = true;
    try {
      const post = await api<import('../data/types').Post>('/posts/' + id);
      original.value = post;
      title.value = post.title;
      content.value = post.content;
      category.value = post.category;
      type.value = post.type;
      tags.value = post.tags.join('，');
      image.value = post.image || '';
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      editorLoading.value = false;
    }
  },
  { immediate: true },
);
</script>
<template>
  <div class="editor-page">
    <RouterLink to="/forum" class="back-link"
      ><Icon name="ArrowLeft" :size="17" />返回交流论坛</RouterLink
    >
    <div class="page-intro">
      <div>
        <div class="eyebrow">SHARE YOUR KNOWLEDGE</div>
        <h1>
          {{ original ? '让分享更完善' : '你的经验，值得被看见' }}<span class="title-dot">.</span>
        </h1>
        <p>记录一次思考，分享一份收获，与更多同路人相遇。</p>
      </div>
    </div>
    <section v-if="authorized" class="panel editor-panel">
      <form @submit.prevent="submit">
        <input
          v-model="title"
          class="editor-title"
          required
          maxlength="100"
          aria-label="帖子标题"
          placeholder="为你的分享起一个好标题…"
        />
        <div class="editor-controls">
          <select v-model="category" aria-label="帖子分类">
            <option
              v-for="c in store.data.categories.filter((c) => c.enabled !== false)"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option></select
          ><select v-model="type" aria-label="帖子类型">
            <option>讨论</option>
            <option>分享</option>
            <option>求助</option>
            <option>资源推荐</option></select
          ><input
            v-model="tags"
            aria-label="标签"
            placeholder="添加标签，用逗号分隔"
            maxlength="100"
          />
        </div>
        <div class="editor-toolbar">
          <div>
            <button type="button" title="二级标题" @click="insert('## ')">
              <Icon name="Heading2" :size="18" /></button
            ><button type="button" title="加粗" @click="insert('**', '**')">
              <Icon name="Bold" :size="18" /></button
            ><button type="button" title="列表" @click="insert('\n- ')">
              <Icon name="List" :size="18" /></button
            ><button type="button" title="引用" @click="insert('\n> ')">
              <Icon name="Quote" :size="18" /></button
            ><button type="button" title="代码块" @click="insert('\n```js\n', '\n```')">
              <Icon name="Code2" :size="18" /></button
            ><label title="添加封面图片"
              ><input
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                @change="upload" /><Icon name="ImagePlus" :size="18"
            /></label>
          </div>
          <button type="button" :class="{ active: preview }" @click="preview = !preview">
            <Icon :name="preview ? 'Pencil' : 'Eye'" :size="16" />{{
              preview ? '继续编辑' : '预览'
            }}
          </button>
        </div>
        <Markdown
          v-if="preview"
          class="editor-preview"
          :content="content || '开始写点什么吧…'"
        /><textarea
          v-else
          ref="editor"
          v-model="content"
          class="editor-body"
          aria-label="帖子正文"
          maxlength="50000"
          placeholder="从一个有趣的问题、一段真实的经历开始…\n\n支持 Markdown：标题、列表、代码块与引用。"
        ></textarea>
        <div v-if="image" class="editor-attachment">
          <img :src="image" alt="帖子封面" /><button
            type="button"
            class="icon-btn"
            aria-label="移除图片"
            @click="image = ''"
          >
            <Icon name="X" :size="17" />
          </button>
        </div>
        <div class="editor-status">
          <span>支持 Markdown · {{ content.length }} 字</span
          ><button type="button" class="text-link" @click="loadDraft">恢复草稿</button>
        </div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <div class="editor-footer">
          <p><Icon name="ShieldCheck" :size="16" />友善交流，尊重原创。让每一次分享都有价值。</p>
          <div>
            <button type="button" class="btn btn-secondary" @click="saveDraft">保存草稿</button
            ><button class="btn btn-primary" :disabled="editorLoading || busy || store.pending > 0">
              <Icon name="Send" :size="17" />{{ original ? '保存修改' : '发布帖子' }}
            </button>
          </div>
        </div>
      </form>
    </section>
    <section v-else class="panel">
      <EmptyState
        title="登录后，分享你的学习经验"
        description="以自己的身份分享经验，留下成长的足迹。"
        ><button class="btn btn-primary" @click="store.modal = { type: 'login' }">
          登录 / 注册
        </button></EmptyState
      >
    </section>
  </div>
</template>
