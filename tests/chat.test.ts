import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { useCommunity } from '../src/stores/community';
import { useChat } from '../src/stores/chat';
import { api, ApiError } from '../src/services/api';
import {
  compareMessageIds,
  mergeMessages,
  type ChatMessage,
  type MessagePage,
  type ThreadPage,
} from '../src/services/chat';
import type { User } from '../src/data/types';

vi.mock('../src/services/api', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
const request = vi.mocked(api);
function user(id: string): User {
  return {
    id,
    name: id,
    bio: '',
    avatar: '',
    role: 'student',
    status: 'active',
    points: 0,
    joined: '2026-10-28T00:00:00.000Z',
  };
}
function message(
  id: string,
  senderId = 'peer',
  recipientId = 'viewer-a',
  clientId = 'client-' + id,
): ChatMessage {
  return {
    id,
    clientId,
    senderId,
    recipientId,
    content: '真实接口约定的文字消息',
    createdAt: '2026-10-28T00:00:00.000Z',
    readAt: null,
  };
}
function page(id = 'peer', items: ChatMessage[] = [], hasMore = false): MessagePage {
  return { peer: user(id), canSend: true, items, hasMore, peerReadUpTo: '0' };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, EventListener>();
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, listener: EventListener) {
    this.listeners.set(name, listener);
  }
  close() {
    this.closed = true;
  }
  emit(name: string) {
    this.listeners.get(name)?.(new Event(name));
  }
}
let pinia: ReturnType<typeof createPinia>;
let hidden = false;
beforeEach(() => {
  localStorage.clear();
  request.mockReset();
  pinia = createPinia();
  setActivePinia(pinia);
  hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => {
  useChat().stop();
  disposePinia(pinia);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function login() {
  const community = useCommunity();
  community.data.users = [user('viewer-a'), user('viewer-b')];
  community.sessionId = 'viewer-a';
  return community;
}

describe('好友私聊的身份、顺序与真实状态', () => {
  it('大消息编号精确排序和去重，不能因Number舍入丢消息', () => {
    expect(compareMessageIds('9007199254740992', '9007199254740993')).toBe(-1);
    const rows = mergeMessages(
      [message('10'), message('9007199254740993')],
      [
        message('9'),
        { ...message('10'), readAt: '2026-10-28T00:01:00.000Z' },
        message('9007199254740992'),
      ],
    );
    expect(rows.map((r) => r.id)).toEqual(['9', '10', '9007199254740992', '9007199254740993']);
    expect(rows[1]?.readAt).toBeTruthy();
  });

  it('切换对话后旧请求不能把另一个人的私聊填进来', async () => {
    login();
    const chat = useChat(),
      old = deferred<MessagePage>();
    request
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page('new-peer', [message('20', 'new-peer')]));
    const reading = chat.activate('old-peer');
    await chat.activate('new-peer');
    old.resolve(page('old-peer', [message('10', 'old-peer')]));
    await reading;
    expect(chat.activePeerId).toBe('new-peer');
    expect(chat.messages.map((r) => r.senderId)).toEqual(['new-peer']);
  });

  it('切换账号立即清空私聊、草稿与失败队列并忽略旧响应', async () => {
    const community = login(),
      chat = useChat(),
      old = deferred<MessagePage>();
    request.mockReturnValueOnce(old.promise);
    const reading = chat.activate('peer');
    chat.draft = '仅属于账号A的未发送草稿';
    chat.unreadCount = 5;
    community.sessionId = 'viewer-b';
    old.resolve(page('peer', [message('10')]));
    await reading;
    expect(chat.messages).toEqual([]);
    expect(chat.pendingMessages).toEqual([]);
    expect(chat.draft).toBe('');
    expect(chat.unreadCount).toBe(0);
    expect(chat.peer).toBeNull();
  });

  it('网络失败保留失败消息，重试沿用同一clientId且成功后仅显示一条', async () => {
    login();
    const chat = useChat();
    request.mockResolvedValueOnce(page());
    await chat.activate('peer');
    request.mockRejectedValueOnce(new ApiError(0, '网络连接中断'));
    await chat.sendMessage('重试这条消息');
    expect(chat.pendingMessages[0]?.status).toBe('failed');
    const key = chat.pendingMessages[0]!.clientId;
    const confirmed = {
      ...message('9007199254740993', 'viewer-a', 'peer', key),
      content: '重试这条消息',
    };
    request.mockResolvedValueOnce({ message: confirmed, peerReadUpTo: '0' });
    await chat.retryMessage(key);
    const writes = request.mock.calls.filter(([, options]) => options?.method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[0]?.[1]?.body).toEqual(writes[1]?.[1]?.body);
    expect(chat.pendingMessages).toEqual([]);
    expect(chat.messages).toEqual([confirmed]);
    expect(request.mock.calls.some(([path]) => path === '/bootstrap')).toBe(false);
  });

  it('隐藏页面不标已读，只有可见阅读时提交本会话的精确游标', async () => {
    login();
    const chat = useChat();
    request.mockResolvedValueOnce(page('peer', [message('9007199254740993')]));
    await chat.activate('peer');
    request.mockClear();
    hidden = true;
    chat.setReadingVisible(true);
    await chat.markRead();
    expect(request).not.toHaveBeenCalled();
    hidden = false;
    request.mockResolvedValueOnce({ unreadCount: 0 });
    chat.setReadingVisible(true);
    await vi.waitFor(() => expect(chat.messages[0]?.readAt).toBeTruthy());
    expect(request).toHaveBeenCalledWith(
      '/chat/threads/peer/read',
      expect.objectContaining({ method: 'PUT', body: { upToId: '9007199254740993' } }),
    );
  });

  it('标读前发出的旧会话列表不能恢复已经清零的未读数', async () => {
    login();
    const chat = useChat(),
      old = deferred<ThreadPage>();
    request.mockResolvedValueOnce(page('peer', [message('10')]));
    await chat.activate('peer');
    chat.unreadCount = 1;
    request.mockReturnValueOnce(old.promise);
    const listing = chat.loadThreads();
    request.mockResolvedValueOnce({ unreadCount: 0 });
    chat.setReadingVisible(true);
    await vi.waitFor(() => expect(chat.messages[0]?.readAt).toBeTruthy());
    old.resolve({
      items: [{ peer: user('peer'), lastMessage: message('10'), unreadCount: 1, canSend: true }],
      total: 1,
      page: 1,
      pageSize: 20,
      unreadCount: 1,
    });
    await listing;
    expect(chat.unreadCount).toBe(0);
    expect(chat.threadLoading).toBe(false);
  });

  it('已读回执使用精确游标，不把尚未读到的下一条标为已读', () => {
    login();
    const chat = useChat();
    chat.peerReadUpTo = '9007199254740993';
    expect(chat.isRead(message('9007199254740993', 'viewer-a', 'peer'))).toBe(true);
    expect(chat.isRead(message('9007199254740994', 'viewer-a', 'peer'))).toBe(false);
  });

  it('推送连接只启动一次，隐藏页签关闭，恢复重连，退出后旧事件失效', async () => {
    vi.useFakeTimers();
    const community = login(),
      chat = useChat();
    request.mockResolvedValue({ count: 0 });
    chat.start();
    chat.start();
    expect(FakeEventSource.instances).toHaveLength(1);
    const first = FakeEventSource.instances[0]!;
    first.emit('ready');
    expect(chat.connected).toBe(true);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(first.closed).toBe(true);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(FakeEventSource.instances).toHaveLength(2);
    const second = FakeEventSource.instances[1]!;
    first.emit('ready');
    expect(chat.connected).toBe(false);
    second.emit('ready');
    expect(chat.connected).toBe(true);
    community.sessionId = '';
    expect(second.closed).toBe(true);
    second.emit('ready');
    expect(chat.connected).toBe(false);
    expect(chat.unreadCount).toBe(0);
    await Promise.resolve();
  });
});
