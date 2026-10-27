import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createSeed } from '../src/data/seed';
import { useCommunity } from '../src/stores/community';
import { api, setCsrfToken, ApiError } from '../src/services/api';
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
const state = () => ({ ...createSeed(), version: 2 });
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());
describe('云数据库客户端状态', () => {
  it('忽略旧的本地账号和业务数据，仅采用后端返回的用户', async () => {
    localStorage.setItem('learnhub.session', 'admin');
    localStorage.setItem('learnhub.frontend.v1', 'untrusted-local-data');
    request.mockResolvedValueOnce({ state: state(), user: null, csrfToken: '' });
    const store = useCommunity();
    await store.initialize();
    expect(store.ready).toBe(true);
    expect(store.currentUser).toBeUndefined();
    expect(store.sessionId).toBe('');
    expect(localStorage.getItem('learnhub.frontend.v1')).toBe('untrusted-local-data');
  });
  it('从真实接口约定恢复账号，CSRF 仅保存在内存', async () => {
    request.mockResolvedValueOnce({
      state: state(),
      user: { id: 'u1' },
      csrfToken: 'session-csrf',
    });
    const store = useCommunity();
    await store.initialize();
    expect(store.currentUser?.id).toBe('u1');
    expect(setCsrfToken).toHaveBeenCalledWith('session-csrf');
    expect(localStorage.getItem('learnhub.session')).toBeNull();
  });
  it('后端不可用时显示错误，不回退本地业务库', async () => {
    request.mockRejectedValueOnce(new Error('数据库连接暂时不可用'));
    const store = useCommunity();
    await store.initialize();
    expect(store.ready).toBe(false);
    expect(store.loadError).toBe('数据库连接暂时不可用');
    expect(store.data.posts).toHaveLength(0);
  });
  it('发帖等待接口和重新读取，不写入 localStorage', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    request.mockResolvedValueOnce({ state: state(), user: { id: 'u1' }, csrfToken: 'csrf' });
    const store = useCommunity();
    await store.initialize();
    request
      .mockResolvedValueOnce({ id: 'post-cloud' })
      .mockResolvedValueOnce({ state: state(), user: { id: 'u1' }, csrfToken: 'csrf' });
    const input = {
      title: '云端学习实践记录',
      content: '所有业务数据应当通过接口写入云数据库，并重新读取。',
      category: 'tech',
      type: '分享',
      tags: [],
    };
    expect(await store.savePost(input)).toBe('post-cloud');
    expect(request).toHaveBeenCalledWith('/posts', { method: 'POST', body: input });
    expect(spy.mock.calls.every(([key]) => key === 'learnhub.theme')).toBe(true);
    expect(store.pending).toBe(0);
  });
  it('过期登录由后端拒绝后进入登录流程', async () => {
    request.mockResolvedValueOnce({ state: state(), user: { id: 'u1' }, csrfToken: 'csrf' });
    const store = useCommunity();
    await store.initialize();
    request.mockRejectedValueOnce(new ApiError(401, '请先登录'));
    await expect(
      store.savePost({
        title: '新的分享标题',
        content: '足够长的分享正文，用于验证过期登录处理。',
        category: 'tech',
        type: '分享',
        tags: [],
      }),
    ).rejects.toThrow();
    expect(store.modal?.type).toBe('login');
    expect(store.currentUser).toBeUndefined();
    expect(store.pending).toBe(0);
  });
  it('用户未登录时不能通过本地操作生成帖子', async () => {
    const store = useCommunity();
    await store.savePost({
      title: '没有登录的发帖',
      content: '不会把这份内容写入本地或服务器。',
      category: 'tech',
      type: '分享',
      tags: [],
    });
    expect(request).not.toHaveBeenCalled();
    expect(store.modal?.type).toBe('login');
  });
});
