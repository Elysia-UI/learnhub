<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCommunity } from '../stores/community';
import { timeAgo, level } from '../services/format';
import Icon from '../components/Icon.vue';
import Avatar from '../components/Avatar.vue';
import Markdown from '../components/Markdown.vue';
import EmptyState from '../components/EmptyState.vue';
import FollowButton from '../components/FollowButton.vue';
import { publicImage } from '../services/images';
const store = useCommunity(),
  route = useRoute(),
  router = useRouter(),
  comment = ref(''),
  replyTo = ref<string>(),
  error = ref('');
const post = computed(() => store.data.posts.find((p) => p.id === route.params.id));
const mine = computed(() => post.value?.authorId === store.currentUser?.id);
watch(
  () => route.params.id,
  (id) => store.visitPost(String(id)),
  { immediate: true },
);
async function send() {
  if (comment.value.trim().length < 2) {
    error.value = '请至少输入 2 个字';
    return;
  }
  if (!store.requireUser() || !post.value) return;
  try {
    await store.commentPost(post.value, comment.value, replyTo.value);
  } catch (e) {
    error.value = (e as Error).message;
    return;
  }
  comment.value = '';
  replyTo.value = undefined;
  error.value = '';
}
function remove() {
  store.modal = {
    type: 'confirm',
    payload: {
      title: '删除这篇帖子？',
      content: '确认删除这篇帖子及其评论？删除后无法恢复。',
      onConfirm: async () => {
        await store.deletePost(post.value!.id);
        router.push('/forum');
      },
    },
  };
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    store.notify('链接已复制');
  } catch {
    store.notify('浏览器未允许复制，请从地址栏复制链接', 'error');
  }
}
</script>
<template>
  <div v-if="post" class="detail-grid">
    <div class="main-column">
      <RouterLink to="/forum" class="back-link"
        ><Icon name="ArrowLeft" :size="17" />返回交流论坛</RouterLink
      >
      <article class="panel article-panel">
        <div class="article-tags">
          <RouterLink :to="`/forum?category=${post.category}`" class="tag tag-blue">{{
            store.category(post.category)?.name
          }}</RouterLink
          ><span v-if="post.featured" class="tag tag-red">精华</span
          ><span class="tag tag-green">{{ post.type }}</span>
        </div>
        <h1>{{ post.title }}</h1>
        <div v-if="post.status !== 'published'" class="preview-info">
          <Icon name="ShieldCheck" :size="20" /><span
            >{{
              post.status === 'pending'
                ? '帖子正在审核，通过后公开展示。'
                : '帖子未通过审核：' + post.reviewReason
            }}
            可以编辑后重新提交。</span
          >
        </div>
        <div class="article-author">
          <RouterLink
            :to="`/members/${post.authorId}`"
            :aria-label="`查看${store.user(post.authorId).name}的主页`"
            ><Avatar :user="store.user(post.authorId)" :size="42"
          /></RouterLink>
          <div>
            <strong
              ><RouterLink :to="`/members/${post.authorId}`">{{
                store.user(post.authorId).name
              }}</RouterLink>
              <span class="level-badge"
                >Lv.{{ level(store.user(post.authorId).points) }}</span
              ></strong
            >
            <p>{{ timeAgo(post.createdAt) }}<span>·</span>{{ post.views }} 次阅读</p>
          </div>
          <FollowButton :user-id="post.authorId" compact class="article-follow" />
          <div v-if="mine || store.currentUser?.role === 'admin'" class="author-actions">
            <RouterLink :to="`/forum/${post.id}/edit`" class="icon-btn" aria-label="编辑帖子"
              ><Icon name="Pencil" :size="18" /></RouterLink
            ><button class="icon-btn" aria-label="删除帖子" @click="remove">
              <Icon name="Trash2" :size="18" />
            </button>
          </div>
        </div>
        <img
          v-if="post.image"
          class="article-image"
          :src="publicImage(post.image)"
          alt="帖子配图"
          decoding="async"
        /><Markdown :content="post.content" />
        <div class="article-tag-list">
          <RouterLink
            v-for="tag in post.tags"
            :key="tag"
            :to="`/search?q=${encodeURIComponent(tag)}`"
            ># {{ tag }}</RouterLink
          >
        </div>
        <div v-if="post.status === 'published'" class="article-actions">
          <button
            class="btn"
            :class="
              post.likes.includes(store.currentUser?.id || '') ? 'btn-primary' : 'btn-secondary'
            "
            @click="store.likePost(post)"
          >
            <Icon name="ThumbsUp" :size="18" />{{ post.likes.length }} 人觉得有帮助</button
          ><button
            class="btn btn-secondary"
            :class="{ favorited: post.favorites.includes(store.currentUser?.id || '') }"
            @click="store.favorite(post.favorites)"
          >
            <Icon name="Bookmark" :size="18" />{{
              post.favorites.includes(store.currentUser?.id || '') ? '已收藏' : '收藏'
            }}</button
          ><button class="icon-btn" aria-label="复制帖子链接" @click="copyLink">
            <Icon name="Link" :size="19" />
          </button>
        </div>
      </article>
      <section class="panel comments-panel">
        <h2>
          一起聊聊<span>{{ post.comments.length }}</span>
        </h2>
        <form v-if="post.status === 'published'" class="comment-form" @submit.prevent="send">
          <Avatar :user="store.currentUser" :size="38" />
          <div>
            <div v-if="replyTo" class="reply-indicator">
              回复 {{ store.user(post.comments.find((c) => c.id === replyTo)!.authorId).name
              }}<button type="button" class="text-link" @click="replyTo = undefined">取消</button>
            </div>
            <textarea
              v-model="comment"
              aria-label="评论内容"
              placeholder="分享你的想法，让交流继续…"
              rows="3"
              maxlength="5000"
              required
            ></textarea>
            <div class="comment-form-footer">
              <small>{{ error || '友善的文字，会让社区更温暖' }}</small
              ><button class="btn btn-primary btn-sm">
                发布评论<Icon name="Send" :size="15" />
              </button>
            </div>
          </div>
        </form>
        <div v-for="c in post.comments" :key="c.id" class="comment-item">
          <Avatar :user="store.user(c.authorId)" :size="36" />
          <div>
            <strong
              >{{ store.user(c.authorId).name
              }}<span v-if="c.authorId === post.authorId" class="tag tag-blue">作者</span></strong
            >
            <p v-if="c.parentId" class="reply-reference">
              回复
              {{ store.user(post.comments.find((x) => x.id === c.parentId)?.authorId || '').name }}
            </p>
            <p class="comment-text">{{ c.content }}</p>
            <div class="comment-meta">
              <time>{{ timeAgo(c.createdAt) }}</time
              ><button v-if="post.status === 'published'" @click="replyTo = c.id">回复</button
              ><button
                v-if="c.authorId === store.currentUser?.id || store.currentUser?.role === 'admin'"
                @click="
                  store.modal = {
                    type: 'confirm',
                    payload: {
                      title: '删除这条评论？',
                      content: '删除后将无法恢复。',
                      onConfirm: () => store.deleteComment(c.id),
                    },
                  }
                "
              >
                删除
              </button>
            </div>
          </div>
        </div>
        <p v-if="!post.comments.length" class="small-empty">还没有评论，来分享第一个想法吧。</p>
      </section>
    </div>
    <aside class="detail-aside">
      <section class="panel author-card">
        <Avatar :user="store.user(post.authorId)" :size="65" />
        <h3>
          {{ store.user(post.authorId).name
          }}<span class="level-badge">Lv.{{ level(store.user(post.authorId).points) }}</span>
        </h3>
        <p>{{ store.user(post.authorId).bio }}</p>
        <FollowButton :user-id="post.authorId" class="author-follow" />
        <div class="author-stat-grid">
          <span
            ><strong>{{
              store.data.posts.filter((p) => p.authorId === post!.authorId).length
            }}</strong
            >篇分享</span
          ><span
            ><strong>{{ store.user(post.authorId).points }}</strong
            >成长积分</span
          >
        </div>
        <RouterLink :to="`/members/${post.authorId}`" class="btn btn-secondary full"
          >看看 TA 的主页<Icon name="ArrowUpRight" :size="16"
        /></RouterLink>
      </section>
      <section class="panel writing-tips">
        <h3><Icon name="Sparkles" :size="18" />延伸阅读</h3>
        <RouterLink
          v-for="p in store.data.posts.filter((p) => p.id !== post!.id).slice(0, 3)"
          :key="p.id"
          :to="`/forum/${p.id}`"
          >{{ p.title }}<Icon name="ChevronRight" :size="16"
        /></RouterLink>
      </section>
    </aside>
  </div>
  <section v-else class="panel">
    <EmptyState title="这篇帖子暂时找不到了" description="它可能已被删除，去看看其他精彩讨论吧。"
      ><RouterLink class="btn btn-primary" to="/forum">返回论坛</RouterLink></EmptyState
    >
  </section>
</template>

<style scoped>
.article-follow {
  margin-left: auto;
}
.author-follow {
  margin: 5px 0 14px;
}
@media (max-width: 480px) {
  .article-author {
    flex-wrap: wrap;
  }
  .article-author > div:not(.author-actions) {
    min-width: 0;
  }
  .article-author strong {
    flex-wrap: wrap;
  }
}
</style>
