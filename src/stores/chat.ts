import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';
import type {
  ChatMessage,
  ChatThread,
  MessagePage,
  PendingMessage,
  ThreadPage,
} from '../services/chat';
import { compareMessageIds, mergeMessages } from '../services/chat';
import type { User } from '../data/types';
import { useCommunity } from './community';

export const useChat = defineStore('chat', () => {
  const community = useCommunity();
  const identity = computed(() => community.currentUser?.id || '');
  const unreadCount = ref(0),
    connected = ref(false),
    connectionError = ref('');
  const threads = ref<ChatThread[]>([]),
    threadTotal = ref(0),
    threadPage = ref(1);
  const threadLoading = ref(false),
    threadError = ref(''),
    search = ref('');
  const activePeerId = ref(''),
    peer = ref<User | null>(null),
    canSend = ref(false);
  const messages = ref<ChatMessage[]>([]),
    peerReadUpTo = ref('0'),
    hasOlder = ref(false);
  const messageLoading = ref(false),
    olderLoading = ref(false),
    messageError = ref('');
  const pendingByPeer = ref<Record<string, PendingMessage[]>>({});
  const drafts = ref<Record<string, string>>({});
  const pendingMessages = computed(() => pendingByPeer.value[activePeerId.value] || []);
  const sending = computed(() => pendingMessages.value.some((row) => row.status === 'sending'));
  const hasMoreThreads = computed(() => threads.value.length < threadTotal.value);
  const draft = computed({
    get: () => drafts.value[activePeerId.value] || '',
    set: (value: string) => {
      if (activePeerId.value) drafts.value[activePeerId.value] = value;
    },
  });
  const controllers = new Set<AbortController>();
  let epoch = 0,
    selection = 0,
    inboxSequence = 0,
    countSequence = 0;
  let started = false,
    readingVisible = false,
    threadViewMounted = false;
  let activeDirty = false,
    incrementAgain = false;
  let source: EventSource | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let readRequest: Promise<void> | undefined;
  let incrementRequest: Promise<void> | undefined;
  let threadController: AbortController | undefined;
  let countController: AbortController | undefined;
  let initialController: AbortController | undefined;
  let olderController: AbortController | undefined;

  function controller() {
    const value = new AbortController();
    controllers.add(value);
    return value;
  }
  function usable(stamp: number, signal?: AbortSignal) {
    return stamp === epoch && !!identity.value && !signal?.aborted;
  }
  function endpoint(id: string) {
    return '/chat/threads/' + encodeURIComponent(id);
  }
  function handleError(error: unknown, stamp: number, target?: { value: string }) {
    if (stamp !== epoch) return;
    if (target) target.value = (error as Error).message;
    if (error instanceof ApiError && error.status === 401) {
      closeTransport();
      community.modal = { type: 'login' };
      void community.initialize();
    }
  }
  function setReceipt(value: string) {
    if (compareMessageIds(value, peerReadUpTo.value) > 0) peerReadUpTo.value = value;
  }
  function merge(items: ChatMessage[]) {
    messages.value = mergeMessages(messages.value, items);
    const sent = new Set(
      items.filter((row) => row.senderId === identity.value).map((row) => row.clientId),
    );
    const id = activePeerId.value;
    if (sent.size)
      pendingByPeer.value[id] = (pendingByPeer.value[id] || []).filter(
        (row) => !sent.has(row.clientId),
      );
  }

  async function refreshUnread() {
    if (!identity.value || document.hidden) return;
    countController?.abort();
    const current = controller(),
      stamp = epoch,
      n = ++countSequence;
    countController = current;
    try {
      const result = await api<{ count: number }>('/chat/unread', { signal: current.signal });
      if (usable(stamp, current.signal) && n === countSequence) unreadCount.value = result.count;
    } catch (error) {
      if (!current.signal.aborted) handleError(error, stamp);
    } finally {
      controllers.delete(current);
    }
  }

  async function loadThreads(append = false) {
    if (!identity.value) return;
    threadController?.abort();
    const current = controller(),
      stamp = epoch,
      n = ++inboxSequence;
    const countStamp = countSequence;
    const nextPage = append ? threadPage.value + 1 : 1,
      term = search.value;
    threadController = current;
    threadLoading.value = true;
    threadError.value = '';
    try {
      const result = await api<ThreadPage>(
        '/chat/threads?' + new URLSearchParams({ page: String(nextPage), pageSize: '20', q: term }),
        { signal: current.signal },
      );
      if (!usable(stamp, current.signal) || n !== inboxSequence) return;
      const all = new Map(
        (append || threadPage.value > 1 ? threads.value : []).map((row) => [row.peer.id, row]),
      );
      for (const row of result.items) all.set(row.peer.id, row);
      threads.value = [...all.values()].sort((a, b) =>
        compareMessageIds(b.lastMessage.id, a.lastMessage.id),
      );
      threadTotal.value = result.total;
      if (append || !threads.value.length || threadPage.value === 1) threadPage.value = result.page;
      if (countStamp === countSequence) unreadCount.value = result.unreadCount;
      community.hydrate({ users: result.items.map((row) => row.peer) });
    } catch (error) {
      if (!current.signal.aborted && n === inboxSequence) handleError(error, stamp, threadError);
    } finally {
      controllers.delete(current);
      if (stamp === epoch && n === inboxSequence) threadLoading.value = false;
    }
  }

  async function setSearch(value: string) {
    search.value = value.trim().slice(0, 100);
    threads.value = [];
    threadPage.value = 1;
    threadTotal.value = 0;
    await loadThreads();
  }

  async function activate(id: string) {
    initialController?.abort();
    olderController?.abort();
    const n = ++selection,
      stamp = epoch;
    readingVisible = false;
    incrementRequest = undefined;
    activeDirty = false;
    incrementAgain = false;
    readRequest = undefined;
    activePeerId.value = id;
    peer.value = null;
    canSend.value = false;
    messages.value = [];
    peerReadUpTo.value = '0';
    hasOlder.value = false;
    messageError.value = '';
    olderLoading.value = false;
    messageLoading.value = false;
    if (!id || !identity.value) return;
    const current = controller();
    initialController = current;
    messageLoading.value = true;
    try {
      const result = await api<MessagePage>(endpoint(id) + '/messages?limit=30', {
        signal: current.signal,
      });
      if (!usable(stamp, current.signal) || n !== selection) return;
      activePeerId.value = result.peer.id;
      peer.value = result.peer;
      canSend.value = result.canSend;
      messages.value = result.items;
      peerReadUpTo.value = result.peerReadUpTo;
      hasOlder.value = result.hasMore;
      community.hydrate({ users: [result.peer] });
    } catch (error) {
      if (!current.signal.aborted && n === selection) handleError(error, stamp, messageError);
    } finally {
      controllers.delete(current);
      if (stamp === epoch && n === selection) {
        messageLoading.value = false;
        if (activeDirty) {
          activeDirty = false;
          scheduleSync(50);
        }
      }
    }
  }

  async function loadOlder() {
    if (!activePeerId.value || !hasOlder.value || olderLoading.value || !messages.value.length)
      return;
    const current = controller(),
      stamp = epoch,
      n = selection;
    const id = activePeerId.value,
      before = messages.value[0]!.id;
    olderController = current;
    olderLoading.value = true;
    messageError.value = '';
    try {
      const result = await api<MessagePage>(
        endpoint(id) + '/messages?' + new URLSearchParams({ before, limit: '30' }),
        { signal: current.signal },
      );
      if (!usable(stamp, current.signal) || n !== selection) return;
      merge(result.items);
      hasOlder.value = result.hasMore;
      canSend.value = result.canSend;
      setReceipt(result.peerReadUpTo);
    } catch (error) {
      if (!current.signal.aborted && n === selection) handleError(error, stamp, messageError);
    } finally {
      controllers.delete(current);
      if (stamp === epoch && n === selection) olderLoading.value = false;
    }
  }

  async function refreshActive() {
    if (!identity.value || !activePeerId.value || document.hidden) return;
    if (messageLoading.value) {
      activeDirty = true;
      return;
    }
    if (incrementRequest) {
      incrementAgain = true;
      return incrementRequest;
    }
    const stamp = epoch,
      n = selection,
      id = activePeerId.value;
    const work = (async () => {
      const current = controller();
      try {
        // Bound each catch-up pass. A longer backlog continues on the next sync.
        for (let batch = 0; batch < 8; batch++) {
          const after = messages.value.at(-1)?.id || '0';
          const result = await api<MessagePage>(
            endpoint(id) + '/messages?' + new URLSearchParams({ after, limit: '50' }),
            { signal: current.signal },
          );
          if (!usable(stamp, current.signal) || n !== selection) return;
          peer.value = result.peer;
          canSend.value = result.canSend;
          messageError.value = '';
          setReceipt(result.peerReadUpTo);
          merge(result.items);
          if (!result.hasMore || !result.items.length) return;
        }
        scheduleSync(250);
      } catch (error) {
        if (!current.signal.aborted && n === selection) handleError(error, stamp, messageError);
      } finally {
        controllers.delete(current);
      }
    })();
    incrementRequest = work;
    try {
      await work;
    } finally {
      if (incrementRequest === work) {
        incrementRequest = undefined;
        if (incrementAgain && stamp === epoch && n === selection) {
          incrementAgain = false;
          scheduleSync(50);
        }
      }
    }
  }

  async function markRead() {
    if (!readingVisible || document.hidden || !activePeerId.value || !identity.value || readRequest)
      return;
    const incoming = messages.value.filter(
      (row) => row.recipientId === identity.value && !row.readAt,
    );
    if (!incoming.length) return;
    const stamp = epoch,
      n = selection,
      id = activePeerId.value;
    const upToId = incoming.at(-1)!.id;
    let completed = false;
    const work = (async () => {
      const current = controller();
      try {
        const result = await api<{ unreadCount: number }>(endpoint(id) + '/read', {
          method: 'PUT',
          body: { upToId },
          signal: current.signal,
        });
        if (!usable(stamp, current.signal)) return;
        countSequence++;
        countController?.abort();
        // An inbox read begun before this receipt could restore stale unread
        // counts after the server has already accepted the read marker.
        inboxSequence++;
        threadController?.abort();
        threadLoading.value = false;
        unreadCount.value = result.unreadCount;
        completed = true;
        if (n === selection) {
          const now = new Date().toISOString();
          messages.value = messages.value.map((row) =>
            row.recipientId === identity.value && compareMessageIds(row.id, upToId) <= 0
              ? { ...row, readAt: row.readAt || now }
              : row,
          );
          const thread = threads.value.find((row) => row.peer.id === id);
          if (thread) thread.unreadCount = 0;
        }
      } catch (error) {
        if (!current.signal.aborted && n === selection) handleError(error, stamp, messageError);
      } finally {
        controllers.delete(current);
      }
    })();
    readRequest = work;
    try {
      await work;
    } finally {
      if (readRequest === work) readRequest = undefined;
      if (
        completed &&
        stamp === epoch &&
        n === selection &&
        readingVisible &&
        !document.hidden &&
        messages.value.some((row) => row.recipientId === identity.value && !row.readAt)
      )
        queueMicrotask(() => void markRead());
    }
  }

  function setReadingVisible(value: boolean) {
    readingVisible = value;
    if (value) void markRead();
  }

  async function sendMessage(content: string, retryClientId?: string) {
    if (
      !community.requireUser() ||
      !activePeerId.value ||
      !content.trim() ||
      content.trim().length > 2000
    )
      return;
    if (!retryClientId && !canSend.value) return;
    const id = activePeerId.value,
      stamp = epoch,
      self = identity.value;
    const items = pendingByPeer.value[id] || (pendingByPeer.value[id] = []);
    let pending = retryClientId ? items.find((row) => row.clientId === retryClientId) : undefined;
    if (pending?.status === 'sending') return;
    if (!pending) {
      pending = {
        clientId: retryClientId || crypto.randomUUID(),
        content: content.trim(),
        createdAt: new Date().toISOString(),
        status: 'sending',
        error: '',
      };
      items.push(pending);
    } else {
      pending.status = 'sending';
      pending.error = '';
    }
    const clientId = pending.clientId;
    const current = controller();
    try {
      const result = await api<{ message: ChatMessage; peerReadUpTo: string }>(
        endpoint(id) + '/messages',
        {
          method: 'POST',
          body: { content: pending.content, clientId },
          requestKey: clientId,
          signal: current.signal,
        },
      );
      if (!usable(stamp, current.signal)) return;
      pendingByPeer.value[id] = (pendingByPeer.value[id] || []).filter(
        (row) => row.clientId !== clientId,
      );
      if (activePeerId.value === id) {
        merge([result.message]);
        setReceipt(result.peerReadUpTo);
      }
      if (threadViewMounted) void loadThreads();
      return result.message;
    } catch (error) {
      if (!usable(stamp, current.signal)) return;
      const confirmed =
        activePeerId.value === id
          ? messages.value.find((row) => row.clientId === clientId && row.senderId === self)
          : undefined;
      if (confirmed) return confirmed;
      const item = (pendingByPeer.value[id] || []).find((row) => row.clientId === clientId);
      if (item) {
        item.status = 'failed';
        item.error = (error as Error).message;
      }
      if (
        error instanceof ApiError &&
        [403, 404].includes(error.status) &&
        activePeerId.value === id
      )
        canSend.value = false;
      handleError(error, stamp);
    } finally {
      controllers.delete(current);
    }
  }

  function retryMessage(clientId: string) {
    const row = pendingMessages.value.find((item) => item.clientId === clientId);
    if (row) return sendMessage(row.content, row.clientId);
  }
  function isRead(row: ChatMessage) {
    return (
      !!row.readAt ||
      (row.senderId === identity.value && compareMessageIds(row.id, peerReadUpTo.value) <= 0)
    );
  }

  async function sync() {
    if (!identity.value || document.hidden) return;
    const tasks: Promise<unknown>[] = [refreshUnread()];
    if (threadViewMounted) tasks.push(loadThreads());
    if (activePeerId.value) tasks.push(refreshActive());
    await Promise.allSettled(tasks);
  }
  function scheduleSync(delay = 200) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void sync(), delay);
  }
  function ensureFallback() {
    if (fallbackTimer || !started || document.hidden || !identity.value) return;
    fallbackTimer = setTimeout(() => {
      fallbackTimer = undefined;
      if (!connected.value) {
        void sync();
        ensureFallback();
      }
    }, 30000);
  }
  function closeTransport() {
    source?.close();
    source = undefined;
    connected.value = false;
    clearTimeout(fallbackTimer);
    fallbackTimer = undefined;
    clearTimeout(syncTimer);
    syncTimer = undefined;
  }
  function openTransport() {
    if (!started || !identity.value || document.hidden || source) return;
    const stamp = epoch;
    if (typeof EventSource === 'undefined') {
      connectionError.value = '当前浏览器使用定时更新消息';
      ensureFallback();
      return;
    }
    const stream = new EventSource('/api/chat/events');
    source = stream;
    stream.addEventListener('ready', () => {
      if (stamp !== epoch || source !== stream) return;
      connected.value = true;
      connectionError.value = '';
      clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
      scheduleSync();
    });
    stream.addEventListener('change', () => {
      if (stamp === epoch && source === stream) scheduleSync();
    });
    stream.onerror = () => {
      if (stamp !== epoch || source !== stream) return;
      connected.value = false;
      connectionError.value = '消息连接暂时中断，正在自动重连';
      ensureFallback();
    };
  }
  function visibilityChanged() {
    if (document.hidden) closeTransport();
    else {
      openTransport();
      void sync();
      if (readingVisible) void markRead();
    }
  }
  function start() {
    if (started) return;
    started = true;
    document.addEventListener('visibilitychange', visibilityChanged);
    openTransport();
    void refreshUnread();
  }
  function stop() {
    started = false;
    document.removeEventListener('visibilitychange', visibilityChanged);
    closeTransport();
    for (const current of controllers) current.abort();
    controllers.clear();
  }
  function setThreadViewMounted(value: boolean) {
    threadViewMounted = value;
    if (value && identity.value) void loadThreads();
    if (!value) {
      inboxSequence++;
      threadController?.abort();
      threadLoading.value = false;
      selection++;
      initialController?.abort();
      olderController?.abort();
      activePeerId.value = '';
      peer.value = null;
      messages.value = [];
      readingVisible = false;
    }
  }

  watch(
    identity,
    () => {
      epoch++;
      selection++;
      inboxSequence++;
      countSequence++;
      closeTransport();
      for (const current of controllers) current.abort();
      controllers.clear();
      threads.value = [];
      threadTotal.value = 0;
      threadPage.value = 1;
      unreadCount.value = 0;
      search.value = '';
      threadError.value = '';
      threadLoading.value = false;
      activePeerId.value = '';
      peer.value = null;
      canSend.value = false;
      messages.value = [];
      peerReadUpTo.value = '0';
      hasOlder.value = false;
      messageLoading.value = false;
      olderLoading.value = false;
      messageError.value = '';
      pendingByPeer.value = {};
      drafts.value = {};
      readingVisible = false;
      readRequest = undefined;
      incrementRequest = undefined;
      activeDirty = false;
      incrementAgain = false;
      connectionError.value = '';
      if (started) {
        openTransport();
        void refreshUnread();
      }
      if (threadViewMounted && identity.value) void loadThreads();
    },
    { flush: 'sync' },
  );

  return {
    unreadCount,
    connected,
    connectionError,
    threads,
    threadTotal,
    threadPage,
    threadLoading,
    threadError,
    search,
    hasMoreThreads,
    activePeerId,
    peer,
    canSend,
    messages,
    peerReadUpTo,
    hasOlder,
    messageLoading,
    olderLoading,
    messageError,
    pendingMessages,
    sending,
    draft,
    start,
    stop,
    refreshUnread,
    loadThreads,
    setSearch,
    activate,
    loadOlder,
    refreshActive,
    markRead,
    setReadingVisible,
    sendMessage,
    retryMessage,
    isRead,
    setThreadViewMounted,
    sync,
  };
});
