<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useCommunity } from '../stores/community';
import { downloadResource } from '../services/files';
import { timeAgo } from '../services/format';
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
</script>
<template>
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
            <div class="resource-detail-meta">
              <span>{{ resource.type }} 格式</span><span>{{ resource.size }}</span
              ><span>{{ resource.downloads }} 次下载</span>
            </div>
          </div>
        </div>
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
