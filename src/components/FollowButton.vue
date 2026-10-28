<script setup lang="ts">
import { computed, watch } from 'vue';
import { useCommunity } from '../stores/community';
import { useSocial } from '../stores/social';
import Icon from './Icon.vue';

const props = withDefaults(defineProps<{ userId: string; compact?: boolean }>(), {
  compact: false,
});
const emit = defineEmits<{ changed: [boolean] }>();
const community = useCommunity(),
  social = useSocial();
const relation = computed(() => social.relationships[props.userId]);
const own = computed(() => props.userId === community.currentUser?.id);
const waiting = computed(() => !!social.busy[props.userId] || !!social.loading[props.userId]);
const label = computed(() =>
  waiting.value
    ? '请稍候…'
    : !relation.value
      ? social.errors[props.userId]
        ? '重试'
        : '关注'
      : relation.value.isFriend
        ? '互相关注'
        : relation.value.following
          ? '已关注'
          : relation.value.followsYou
            ? '回关'
            : '关注',
);
watch(
  [() => props.userId, () => community.currentUser?.id],
  () => {
    if (!own.value) void social.ensureRelationship(props.userId);
  },
  { immediate: true },
);
async function change() {
  if (!community.requireUser()) return;
  if (!relation.value) {
    await social.loadSummary(props.userId, true);
    if (!relation.value) return;
  }
  const result = await social.setFollowing(props.userId, !relation.value.following);
  if (result) emit('changed', result.following);
}
</script>

<template>
  <span v-if="userId && !own" class="follow-control" :class="{ compact }">
    <button
      type="button"
      class="btn follow-button"
      :class="[relation?.following ? 'btn-secondary' : 'btn-primary', { 'btn-sm': compact }]"
      :disabled="waiting"
      :aria-label="
        relation?.following
          ? relation.isFriend
            ? '取消关注这位好友'
            : '取消关注此用户'
          : relation?.followsYou
            ? '回关此用户'
            : '关注此用户'
      "
      :aria-pressed="!!relation?.following"
      :title="relation?.following ? '点击取消关注' : undefined"
      @click="change"
    >
      <Icon
        :name="
          waiting
            ? 'LoaderCircle'
            : relation?.isFriend
              ? 'UsersRound'
              : relation?.following
                ? 'UserCheck'
                : 'UserPlus'
        "
        :size="compact ? 14 : 16"
        :class="{ spin: waiting }"
      />{{ label }}
    </button>
    <small v-if="social.errors[userId]" class="follow-error" role="alert">{{
      social.errors[userId]
    }}</small>
  </span>
</template>

<style scoped>
.follow-control {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.follow-button {
  min-width: 102px;
  white-space: nowrap;
}
.compact .follow-button {
  min-width: 82px;
}
.follow-error {
  color: #e35572;
  font-size: 11px;
  max-width: 210px;
  line-height: 1.6;
}
</style>
