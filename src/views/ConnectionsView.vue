<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { User } from '../data/types';
import type { ConnectionType, ConnectionUser } from '../services/social';
import { api } from '../services/api';
import { level, roleName } from '../services/format';
import { useCommunity } from '../stores/community';
import { useSocial } from '../stores/social';
import Avatar from '../components/Avatar.vue';
import Icon from '../components/Icon.vue';
import FollowButton from '../components/FollowButton.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';

const route = useRoute(),
  router = useRouter(),
  community = useCommunity(),
  social = useSocial();
const requestedOwnerId = computed(() => String(route.params.id || community.currentUser?.id || ''));
const canonicalOwnerId = ref('');
const ownerId = computed(() => canonicalOwnerId.value || requestedOwnerId.value);
const own = computed(
  () => !!ownerId.value && ownerId.value.toLowerCase() === community.currentUser?.id.toLowerCase(),
);
const type = computed<ConnectionType>(() =>
  ['following', 'followers', 'friends'].includes(String(route.query.type))
    ? (route.query.type as ConnectionType)
    : 'following',
);
const keywords = computed(() => String(route.query.q || ''));
const search = ref(keywords.value),
  owner = ref<User>(),
  headerError = ref('');
const summary = computed(() => social.summaries[ownerId.value]);
const items = ref<ConnectionUser[]>([]),
  total = ref(0),
  page = ref(1),
  loading = ref(false),
  error = ref('');
const tabs = computed(() => [
  { id: 'following' as const, label: '关注', count: summary.value?.followingCount },
  { id: 'followers' as const, label: '粉丝', count: summary.value?.followersCount },
  ...(own.value
    ? [{ id: 'friends' as const, label: '好友', count: summary.value?.friendsCount }]
    : []),
]);
const title = computed(() =>
  type.value === 'friends' ? '互关好友' : type.value === 'followers' ? '粉丝' : '关注',
);
let listController: AbortController | undefined, headerController: AbortController | undefined;
let sequence = 0,
  headerSequence = 0;

async function loadHeader() {
  const id = requestedOwnerId.value,
    n = ++headerSequence;
  headerController?.abort();
  const controller = new AbortController();
  headerController = controller;
  canonicalOwnerId.value = '';
  owner.value = own.value ? community.currentUser : undefined;
  headerError.value = '';
  if (!id) return;
  try {
    const user = await api<User>('/members/' + encodeURIComponent(id), {
      signal: controller.signal,
    });
    if (n !== headerSequence || controller.signal.aborted) return;
    owner.value = user;
    canonicalOwnerId.value = user.id;
    community.hydrate({ users: [user] });
    void social.loadSummary(user.id, true);
  } catch (e) {
    if (n === headerSequence && !controller.signal.aborted)
      headerError.value = (e as Error).message;
  }
}

async function load() {
  const n = ++sequence;
  const viewer = community.currentUser?.id;
  listController?.abort();
  const controller = new AbortController();
  listController = controller;
  items.value = [];
  total.value = 0;
  error.value = '';
  loading.value = false;
  if (!ownerId.value || (type.value === 'friends' && !own.value)) return;
  loading.value = true;
  try {
    const params = new URLSearchParams({
      type: type.value,
      page: String(page.value),
      pageSize: '8',
      q: keywords.value,
    });
    const result = await api<{ items: ConnectionUser[]; total: number }>(
      '/members/' + encodeURIComponent(ownerId.value) + '/connections?' + params,
      { signal: controller.signal },
    );
    if (n !== sequence || controller.signal.aborted || viewer !== community.currentUser?.id) return;
    const maxPage = Math.max(1, Math.ceil(result.total / 8));
    if (page.value > maxPage) {
      page.value = maxPage;
      return;
    }
    social.prime(result.items);
    community.hydrate({ users: result.items });
    items.value = result.items;
    total.value = result.total;
  } catch (e) {
    if (n === sequence && !controller.signal.aborted) error.value = (e as Error).message;
  } finally {
    if (n === sequence) loading.value = false;
  }
}

function choose(next: ConnectionType) {
  router.replace({ path: route.path, query: { ...route.query, type: next } });
}
function searchPeople() {
  router.replace({
    path: route.path,
    query: { ...route.query, type: type.value, q: search.value.trim() || undefined },
  });
}
watch([requestedOwnerId, () => community.currentUser?.id], () => void loadHeader(), {
  immediate: true,
});
watch(
  [ownerId, type, keywords, () => community.currentUser?.id],
  () => {
    search.value = keywords.value;
    if (page.value !== 1) page.value = 1;
    else void load();
  },
  { immediate: true },
);
watch(page, () => void load());
watch(
  () => social.revision,
  () => void load(),
);
onUnmounted(() => {
  listController?.abort();
  headerController?.abort();
  sequence++;
  headerSequence++;
});
</script>

<template>
  <div class="full-page connections-page">
    <RouterLink
      :to="own ? '/profile' : ownerId ? '/members/' + ownerId : '/profile'"
      class="back-link"
      ><Icon name="ArrowLeft" :size="16" />{{ own ? '返回个人中心' : '返回用户主页' }}</RouterLink
    >
    <section v-if="ownerId" class="panel connections-panel">
      <header class="connections-heading">
        <RouterLink
          v-if="owner"
          :to="own ? '/profile' : '/members/' + ownerId"
          class="connection-owner"
          ><Avatar :user="owner" :size="54" /><span
            ><h1>{{ own ? '我的学习伙伴' : owner.name + '的学习伙伴' }}</h1>
            <p>
              {{
                type === 'friends'
                  ? '互相关注，就成为彼此的学习好友。好友列表仅自己可见。'
                  : '从一次关注开始，遇见愿意一起学习的人。'
              }}
            </p></span
          ></RouterLink
        >
        <div v-else>
          <h1>学习伙伴</h1>
          <p class="muted">{{ headerError || '正在读取用户信息…' }}</p>
          <button v-if="headerError" class="text-link" @click="loadHeader">重新读取</button>
        </div>
        <RouterLink v-if="own" to="/forum?scope=following" class="btn btn-secondary btn-sm"
          ><Icon name="MessagesSquare" :size="15" />关注动态</RouterLink
        >
      </header>
      <div class="connections-toolbar">
        <div class="line-tabs" role="tablist" aria-label="用户关系类型">
          <button
            v-for="item in tabs"
            :key="item.id"
            role="tab"
            :aria-selected="type === item.id"
            :class="{ active: type === item.id }"
            @click="choose(item.id)"
          >
            {{ item.label }}<span>{{ item.count ?? '—' }}</span>
          </button>
        </div>
        <form class="connection-search" @submit.prevent="searchPeople">
          <Icon name="Search" :size="16" /><input
            v-model="search"
            aria-label="搜索学习伙伴"
            placeholder="搜索昵称或简介"
            maxlength="100"
          /><button type="submit" class="text-link">搜索</button>
        </form>
      </div>
      <p v-if="social.errors[ownerId]" class="form-error">
        {{ social.errors[ownerId] }}
        <button class="text-link" @click="social.loadSummary(ownerId, true)">重试统计</button>
      </p>
      <EmptyState
        v-if="type === 'friends' && !own"
        title="好友列表仅本人可见"
        description="可以查看对方公开的关注和粉丝列表。"
        ><button class="btn btn-secondary" @click="choose('following')">
          查看关注
        </button></EmptyState
      >
      <p v-else-if="loading" class="small-empty" role="status">正在读取{{ title }}…</p>
      <div v-else-if="error" class="connection-list-error">
        <Icon name="CircleAlert" :size="26" />
        <p>{{ error }}</p>
        <button class="btn btn-secondary btn-sm" @click="load">重试</button>
      </div>
      <template v-else>
        <div v-for="user in items" :key="user.id" class="connection-row">
          <RouterLink :to="'/members/' + user.id" class="connection-person"
            ><Avatar :user="user" :size="48" /><span
              ><span class="connection-name"
                >{{ user.name }}<span class="level-badge">Lv.{{ level(user.points) }}</span
                ><span class="connection-role">{{ roleName(user.role) }}</span></span
              ><span class="connection-bio">{{
                user.bio || '还没有填写简介，正在认真学习中。'
              }}</span
              ><span v-if="social.relationships[user.id]?.isFriend" class="connection-relation"
                ><Icon name="Users" :size="12" />互关好友</span
              ><span
                v-else-if="social.relationships[user.id]?.followsYou"
                class="connection-relation"
                >关注了你</span
              ></span
            ></RouterLink
          >
          <FollowButton :user-id="user.id" compact />
        </div>
        <EmptyState
          v-if="!items.length"
          :title="
            keywords
              ? '没有找到相关伙伴'
              : type === 'friends'
                ? '还没有互关好友'
                : type === 'followers'
                  ? own
                    ? '还没有粉丝'
                    : 'TA 还没有粉丝'
                  : own
                    ? '还没有关注任何人'
                    : 'TA 还没有关注任何人'
          "
          :description="
            keywords
              ? '换个昵称或关键词试试。'
              : type === 'friends'
                ? '关注感兴趣的作者，对方回关后就会出现在这里。'
                : type === 'followers'
                  ? '认真分享所学，让更多人认识你。'
                  : '逛逛社区，关注带来灵感的作者。'
          "
          ><RouterLink to="/forum" class="btn btn-secondary">去社区看看</RouterLink></EmptyState
        >
        <Pagination v-model="page" :total="total" />
      </template>
    </section>
    <section v-else class="panel">
      <EmptyState
        title="登录后认识更多学习伙伴"
        description="关注喜欢的作者，和互关好友一起记录成长。"
        ><button class="btn btn-primary" @click="community.modal = { type: 'login' }">
          登录 / 注册
        </button></EmptyState
      >
    </section>
  </div>
</template>

<style scoped>
.connections-page {
  max-width: 1060px;
  display: grid;
  gap: 18px;
}
.connections-panel {
  padding: 28px 30px 10px;
}
.connections-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding-bottom: 24px;
}
.connection-owner,
.connection-person {
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 0;
}
.connection-owner h1,
.connections-heading h1 {
  font-size: 22px;
  line-height: 1.5;
  margin: 0 0 6px;
}
.connection-owner p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.8;
  margin: 0;
}
.connections-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 22px;
  align-items: center;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.connections-toolbar .line-tabs {
  border: 0;
}
.connection-search {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  min-width: 0;
}
.connection-search input {
  border: 0;
  background: transparent;
  padding: 8px 0;
  width: 155px;
  font-size: 12px;
}
.connection-search button {
  flex-shrink: 0;
}
.connection-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  padding: 22px 0;
  border-bottom: 1px solid var(--border);
}
.connection-person > span {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.connection-name {
  display: flex;
  gap: 9px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 14px;
  font-weight: 650;
}
.connection-role {
  font-size: 10px;
  font-weight: 400;
  color: var(--muted);
}
.connection-bio {
  color: var(--subtle);
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.connection-relation {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--primary);
  font-size: 10px;
}
.connection-list-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 50px 15px;
  color: var(--muted);
}
@media (max-width: 700px) {
  .connections-panel {
    padding: 20px 17px 8px;
  }
  .connections-heading {
    flex-wrap: wrap;
    gap: 16px;
  }
  .connection-owner h1 {
    font-size: 19px;
  }
  .connection-owner {
    align-items: flex-start;
    gap: 12px;
  }
  .connections-toolbar {
    flex-wrap: wrap;
    gap: 0;
    padding-bottom: 10px;
  }
  .connection-search {
    width: 100%;
    border-top: 1px solid var(--border);
    padding-top: 7px;
  }
  .connection-search input {
    flex: 1;
  }
  .connection-row {
    gap: 12px;
    align-items: flex-start;
  }
  .connection-person {
    gap: 10px;
    align-items: flex-start;
  }
  .connection-name {
    gap: 6px;
  }
  .connection-role {
    display: none;
  }
}
</style>
