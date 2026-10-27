import { ref, watch, onUnmounted, type WatchSource } from 'vue';
import { api } from './api';
import { useCommunity } from '../stores/community';
export function usePaged<T = any>(
  path: () => string,
  sources: WatchSource[],
  kind?: 'posts' | 'courses' | 'questions' | 'resources',
) {
  const items = ref<T[]>([]) as import('vue').Ref<T[]>,
    total = ref(0),
    page = ref(1),
    loading = ref(false),
    error = ref('');
  let current: AbortController | undefined;
  async function load() {
    current?.abort();
    const controller = new AbortController();
    current = controller;
    loading.value = true;
    error.value = '';
    try {
      const url = path();
      if (!url) {
        items.value = [];
        total.value = 0;
        return;
      }
      const r = await api<{ items: T[]; total: number; users?: any[]; enrollments?: any[] }>(
        url + (url.includes('?') ? '&' : '?') + 'page=' + page.value,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      items.value = r.items;
      total.value = r.total;
      const store = useCommunity();
      store.hydrate(r, kind);
      if (r.enrollments) store.data.enrollments = r.enrollments;
    } catch (e) {
      if (!controller.signal.aborted) error.value = (e as Error).message;
    } finally {
      if (current === controller) loading.value = false;
    }
  }
  watch(sources, () => {
    if (page.value !== 1) page.value = 1;
    else void load();
  });
  watch(page, () => void load());
  onUnmounted(() => current?.abort());
  void load();
  return { items, total, page, loading, error, load };
}
