import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';
import type { ConnectionUser, Relationship, SocialSummary } from '../services/social';
import { useCommunity } from './community';

export const useSocial = defineStore('social', () => {
  const community = useCommunity();
  const identity = computed(() => community.currentUser?.id || '');
  const relationships = ref<Record<string, Relationship>>({});
  const summaries = ref<Record<string, SocialSummary>>({});
  const loading = ref<Record<string, boolean>>({});
  const busy = ref<Record<string, boolean>>({});
  const errors = ref<Record<string, string>>({});
  const revision = ref(0);
  const reads = new Map<string, Promise<SocialSummary | undefined>>();
  const controllers = new Set<AbortController>();
  let epoch = 0;

  watch(
    identity,
    () => {
      epoch++;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      reads.clear();
      relationships.value = {};
      summaries.value = {};
      loading.value = {};
      busy.value = {};
      errors.value = {};
      revision.value++;
    },
    { flush: 'sync' },
  );

  function saveRelationship(id: string, value: Relationship) {
    relationships.value[id] = {
      following: !!value.following,
      followsYou: !!value.followsYou,
      isFriend: !!value.isFriend,
    };
    if (summaries.value[id]) Object.assign(summaries.value[id], relationships.value[id]);
  }

  function prime(users: ConnectionUser[]) {
    for (const user of users)
      if (!busy.value[user.id]) saveRelationship(user.id, user.relationship);
  }

  async function loadSummary(id: string, force = false): Promise<SocialSummary | undefined> {
    if (!id) return;
    // A forced read during a write could return the pre-write relationship later.
    // The write response is authoritative until the operation has completed.
    if (busy.value[id]) return summaries.value[id];
    if (!force && summaries.value[id]) return summaries.value[id];
    if (reads.has(id)) return reads.get(id);
    const stamp = epoch;
    const controller = new AbortController();
    controllers.add(controller);
    loading.value[id] = true;
    errors.value[id] = '';
    const request = (async () => {
      try {
        const result = await api<SocialSummary>('/members/' + encodeURIComponent(id) + '/social', {
          signal: controller.signal,
        });
        if (stamp !== epoch || controller.signal.aborted) return;
        summaries.value[id] = result;
        saveRelationship(id, result);
        return result;
      } catch (error) {
        if (stamp === epoch && !controller.signal.aborted)
          errors.value[id] = (error as Error).message;
        return undefined;
      } finally {
        controllers.delete(controller);
        if (stamp === epoch) {
          loading.value[id] = false;
          reads.delete(id);
        }
      }
    })();
    reads.set(id, request);
    return request;
  }

  async function ensureRelationship(id: string) {
    if (!id || id === identity.value || relationships.value[id]) return;
    return loadSummary(id);
  }

  async function setFollowing(id: string, active: boolean) {
    if (!community.requireUser() || !id || id === identity.value || busy.value[id]) return;
    const stamp = epoch;
    busy.value[id] = true;
    errors.value[id] = '';
    // A read started before this write must not replace its newer relationship.
    await reads.get(id);
    if (stamp !== epoch) return;
    try {
      const result = await api<SocialSummary>('/members/' + encodeURIComponent(id) + '/follow', {
        method: 'PUT',
        body: { active },
      });
      if (stamp !== epoch) return;
      summaries.value[id] = result;
      saveRelationship(id, result);
      revision.value++;
      community.notify(
        active ? (result.isFriend ? '已互相关注，你们现在是好友了' : '已关注') : '已取消关注',
      );
      // Only refresh social counts; following does not reload the full bootstrap.
      const ownId = identity.value;
      if (ownId !== id && summaries.value[ownId]) {
        void (async () => {
          // A header count read may have begun before this follow operation.
          // Wait for it, then request counts that include the completed write.
          await reads.get(ownId);
          if (stamp === epoch) await loadSummary(ownId, true);
        })();
      }
      return result;
    } catch (error) {
      if (stamp !== epoch) return;
      errors.value[id] = (error as Error).message;
      if (error instanceof ApiError && error.status === 401) {
        community.modal = { type: 'login' };
        void community.initialize();
      }
      community.notify((error as Error).message, 'error');
      return undefined;
    } finally {
      if (stamp === epoch) busy.value[id] = false;
    }
  }

  return {
    relationships,
    summaries,
    loading,
    busy,
    errors,
    revision,
    prime,
    loadSummary,
    ensureRelationship,
    setFollowing,
  };
});
