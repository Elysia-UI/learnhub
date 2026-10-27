<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCommunity } from '../stores/community';
import { downloadResource } from '../services/files';
import { timeAgo } from '../services/format';
import { api } from '../services/api';
import Icon from '../components/Icon.vue';
import Avatar from '../components/Avatar.vue';
import EmptyState from '../components/EmptyState.vue';
import ResourceCard from '../components/ResourceCard.vue';
const store = useCommunity(),
  route = useRoute(),
  busy = ref(false);
const resource = computed(() =>
  store.data.resources.find(
    (r) =>
      r.id === route.params.id &&
      (r.status === 'approved' ||
        r.authorId === store.currentUser?.id ||
        store.currentUser?.role === 'admin'),
  ),
);
async function download() {
  if (!resource.value || !store.requireUser()) return;
  if (resource.value.status !== 'approved') return store.notify('资源审核通过后才能下载', 'error');
  busy.value = true;
  try {
    await downloadResource(resource.value);
    await store.refresh();
    store.notify('下载已开始，祝学习愉快');
  } catch (e) {
    store.notify((e as Error).message, 'error');
  } finally {
    busy.value = false;
  }
}
const detailError = ref(''),
  detailLoading = ref(false);
async function loadDetail() {
  detailLoading.value = true;
  detailError.value = '';
  try {
    const r = await api<{ item: any; users: any[] }>('/resources/' + route.params.id);
    store.hydrate({ items: [r.item], users: r.users }, 'resources');
  } catch (e) {
    detailError.value = (e as Error).message;
  } finally {
    detailLoading.value = false;
  }
}
watch(
  () => route.params.id,
  () => void loadDetail(),
  { immediate: true },
);
watch(
  () => store.pending,
  (n, old) => {
    if (old > 0 && n === 0) void loadDetail();
  },
);
const editing = ref(false),
  editForm = ref({ title: '', description: '', category: 'tech', tags: '' }),
  editError = ref(''),
  editBusy = ref(false);
function edit() {
  if (!resource.value) return;
  editForm.value = {
    title: resource.value.title,
    description: resource.value.description,
    category: resource.value.category,
    tags: resource.value.tags.join('，'),
  };
  editing.value = true;
}
async function saveResource() {
  editBusy.value = true;
  editError.value = '';
  try {
    await api('/resources/' + route.params.id, {
      method: 'PATCH',
      body: {
        ...editForm.value,
        tags: editForm.value.tags
          .split(/[,，]/)
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 5),
      },
    });
    editing.value = false;
    await Promise.all([store.refresh(), loadDetail()]);
    store.notify('资源已保存，普通用户的修改将重新审核');
  } catch (e) {
    editError.value = (e as Error).message;
  } finally {
    editBusy.value = false;
  }
}
</script>
<template>
  <p v-if="detailLoading" class="small-empty">正在加载…</p>
  <p v-if="detailError" class="form-error">
    {{ detailError }} <button class="text-link" @click="loadDetail">重试</button>
  </p>
  <div v-if="resource" class="detail-grid">
    <div class="main-column">
      <RouterLink to="/resources" class="back-link"
        ><Icon name="ArrowLeft" :size="17" />返回资源中心</RouterLink
      >
      <section class="panel resource-detail">
        <div class="resource-detail-top">
          <span class="file-tile large" :class="`file-${resource.type.toLowerCase()}`"
            ><Icon
              :name="
                resource.type === 'CSV'
                  ? 'FileSpreadsheet'
                  : resource.type === 'ZIP'
                    ? 'FileArchive'
                    : 'FileText'
              "
              :size="46"
          /></span>
          <div>
            <span class="tag tag-blue">{{ store.category(resource.category)?.name }}</span>
            <h1>{{ resource.title }}</h1>
            <button
              v-if="
                resource.authorId === store.currentUser?.id || store.currentUser?.role === 'admin'
              "
              class="text-link"
              @click="edit"
            >
              编辑资源 / 重新提交审核
            </button>
            <div class="resource-detail-meta">
              <span>{{ resource.type }} 格式</span><span>{{ resource.size }}</span
              ><span>{{ resource.downloads }} 次下载</span>
            </div>
          </div>
        </div>
        <form v-if="editing" class="notice-editor" @submit.prevent="saveResource">
          <label class="field"
            >名称<input v-model="editForm.title" required minlength="2" maxlength="100" /></label
          ><label class="field"
            >介绍<textarea
              v-model="editForm.description"
              required
              minlength="10"
              maxlength="20000"
            ></textarea></label
          ><label class="field"
            >分类<select v-model="editForm.category">
              <option
                v-for="c in store.data.categories.filter((c) => c.enabled !== false)"
                :value="c.id"
                :key="c.id"
              >
                {{ c.name }}
              </option>
            </select></label
          ><label class="field">标签<input v-model="editForm.tags" maxlength="100" /></label>
          <p v-if="editError" class="form-error">{{ editError }}</p>
          <button class="btn btn-primary btn-sm" :disabled="editBusy">保存</button
          ><button type="button" class="btn btn-secondary btn-sm" @click="editing = false">
            取消
          </button>
        </form>
        <div v-if="resource.status !== 'approved'" class="preview-info">
          <Icon name="Clock3" :size="18" />{{
            resource.status === 'pending'
              ? '这份资源正在等待审核，暂未公开展示。'
              : '这份资源未通过审核，请检查内容后重新分享。'
          }}
        </div>
        <h2>关于这份资源</h2>
        <p class="resource-description">{{ resource.description }}</p>
        <div class="article-tag-list">
          <RouterLink
            v-for="tag in resource.tags"
            :key="tag"
            :to="`/search?q=${encodeURIComponent(tag)}`"
            ># {{ tag }}</RouterLink
          >
        </div>
        <div class="resource-included">
          <h3><Icon name="FolderOpen" :size="19" />资源文件</h3>
          <div>
            <Icon name="FileText" :size="22" /><span
              >{{ resource.filename }}<small>{{ resource.size }} · {{ resource.type }}</small></span
            ><Icon name="CheckCircle2" :size="20" />
          </div>
        </div>
        <div class="article-actions">
          <button
            class="btn btn-primary"
            :disabled="busy || resource.status !== 'approved'"
            @click="download"
          >
            <Icon :name="busy ? 'LoaderCircle' : 'Download'" :size="18" :class="{ spin: busy }" />{{
              busy ? '正在准备…' : '下载学习资源'
            }}</button
          ><button
            class="btn btn-secondary"
            :class="{ favorited: resource.favorites.includes(store.currentUser?.id || '') }"
            @click="store.favorite(resource.favorites)"
          >
            <Icon name="Bookmark" :size="18" />{{
              resource.favorites.includes(store.currentUser?.id || '') ? '已收藏' : '收藏资源'
            }}
          </button>
        </div>
        <div class="copyright-note">
          <Icon name="ShieldCheck" :size="18" />资源由社区用户分享，请尊重原创，仅在授权范围内使用。
        </div>
      </section>
      <section class="panel related-resources">
        <h2>你可能还会需要</h2>
        <ResourceCard
          v-for="r in store.data.resources
            .filter((r) => r.id !== resource!.id && r.status === 'approved')
            .slice(0, 3)"
          :key="r.id"
          :resource="r"
        />
      </section>
    </div>
    <aside class="detail-aside">
      <section class="panel author-card">
        <Avatar :user="store.user(resource.authorId)" :size="65" />
        <h3>{{ store.user(resource.authorId).name }}</h3>
        <span class="tag tag-green">资源分享者</span>
        <p>{{ store.user(resource.authorId).bio }}</p>
        <small>分享于 {{ timeAgo(resource.createdAt) }}</small
        ><RouterLink :to="`/members/${resource.authorId}`" class="btn btn-secondary full"
          >查看 TA 的主页<Icon name="ArrowUpRight" :size="16"
        /></RouterLink>
      </section>
      <div class="gentle-tip">
        <Icon name="Heart" :size="23" />
        <p>如果这份资料帮到了你，<br />也欢迎分享自己的收获。</p>
      </div>
    </aside>
  </div>
  <section v-else class="panel">
    <EmptyState title="这份资源暂时不可用" description="资源可能正在审核，或已经被移除。"
      ><RouterLink to="/resources" class="btn btn-primary">发现更多资源</RouterLink></EmptyState
    >
  </section>
</template>
