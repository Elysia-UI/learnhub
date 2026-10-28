import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCommunity } from '../src/stores/community';
import { useSocial } from '../src/stores/social';
import { api } from '../src/services/api';
import type { User } from '../src/data/types';
import type { ConnectionUser, SocialSummary } from '../src/services/social';

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
    avatar: '',
    bio: '',
    role: 'student',
    points: 0,
    joined: '2026-10-28T00:00:00.000Z',
    status: 'active',
  };
}
function summary(following = false, followsYou = false): SocialSummary {
  return {
    followingCount: 0,
    followersCount: Number(following),
    friendsCount: Number(following && followsYou),
    following,
    followsYou,
    isFriend: following && followsYou,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function login() {
  const community = useCommunity();
  community.data.users = [user('viewer-a'), user('viewer-b')];
  community.sessionId = 'viewer-a';
  vi.spyOn(community, 'notify').mockImplementation(() => {});
  return community;
}
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('关注关系的前端隔离与请求顺序', () => {
  it('分页列表携带的关系用于按钮，不为每个用户单独发起状态查询', async () => {
    login();
    const social = useSocial();
    const people: ConnectionUser[] = Array.from({ length: 8 }, (_, i) => ({
      ...user('person-' + i),
      relationship: summary(i % 2 === 0, true),
    }));
    social.prime(people);
    await Promise.all(people.map((p) => social.ensureRelationship(p.id)));
    expect(request).not.toHaveBeenCalled();
    expect(social.relationships['person-0']?.isFriend).toBe(true);
    expect(social.relationships['person-1']?.followsYou).toBe(true);
  });

  it('帖子作者栏和侧栏同时读取一个人时合并请求', async () => {
    login();
    const social = useSocial(),
      pending = deferred<SocialSummary>();
    request.mockReturnValueOnce(pending.promise);
    const first = social.ensureRelationship('author'),
      second = social.ensureRelationship('author');
    expect(request).toHaveBeenCalledTimes(1);
    pending.resolve(summary());
    await Promise.all([first, second]);
    expect(social.relationships.author?.following).toBe(false);
  });

  it('连续点击只写一次，采用服务端关系结果且不重新读取整个社区', async () => {
    login();
    const social = useSocial(),
      pending = deferred<SocialSummary>();
    social.prime([{ ...user('author'), relationship: summary(false, true) }]);
    request.mockReturnValueOnce(pending.promise);
    const first = social.setFollowing('author', true),
      second = social.setFollowing('author', true);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/members/author/follow', {
      method: 'PUT',
      body: { active: true },
    });
    pending.resolve(summary(true, true));
    await Promise.all([first, second]);
    expect(social.relationships.author?.isFriend).toBe(true);
    expect(social.busy.author).toBe(false);
    expect(request.mock.calls.some(([path]) => path === '/bootstrap')).toBe(false);
  });

  it('写入失败保留真实关系并显示错误，不能伪装成功', async () => {
    login();
    const social = useSocial();
    social.prime([{ ...user('author'), relationship: summary() }]);
    request.mockRejectedValueOnce(new Error('网络暂时不可用'));
    expect(await social.setFollowing('author', true)).toBeUndefined();
    expect(social.relationships.author?.following).toBe(false);
    expect(social.errors.author).toBe('网络暂时不可用');
    expect(social.busy.author).toBe(false);
  });

  it('写入期间不发出可能覆盖新关系的旧状态读取', async () => {
    login();
    const social = useSocial(),
      pending = deferred<SocialSummary>();
    social.prime([{ ...user('author'), relationship: summary() }]);
    request.mockReturnValueOnce(pending.promise);
    const writing = social.setFollowing('author', true);
    await Promise.resolve();
    await social.loadSummary('author', true);
    expect(request).toHaveBeenCalledTimes(1);
    pending.resolve(summary(true, true));
    await writing;
    expect(social.relationships.author?.isFriend).toBe(true);
  });

  it('切换账号后忽略旧账号未完成的关系读取', async () => {
    const community = login();
    const social = useSocial(),
      pending = deferred<SocialSummary>();
    request.mockReturnValueOnce(pending.promise);
    const reading = social.loadSummary('author');
    community.sessionId = 'viewer-b';
    pending.resolve(summary(true, true));
    await reading;
    expect(social.relationships).toEqual({});
    expect(social.summaries).toEqual({});
    expect(social.loading).toEqual({});
  });

  it('切换账号后旧写入响应不能污染新账号界面', async () => {
    const community = login();
    const social = useSocial(),
      pending = deferred<SocialSummary>();
    social.prime([{ ...user('author'), relationship: summary() }]);
    request.mockReturnValueOnce(pending.promise);
    const writing = social.setFollowing('author', true);
    await Promise.resolve();
    community.sessionId = 'viewer-b';
    pending.resolve(summary(true, true));
    await writing;
    expect(social.relationships).toEqual({});
    expect(social.summaries).toEqual({});
    expect(social.busy).toEqual({});
  });

  it('游客点击关注进入登录流程，不发写入请求', async () => {
    const community = useCommunity(),
      social = useSocial();
    await social.setFollowing('author', true);
    expect(request).not.toHaveBeenCalled();
    expect(community.modal?.type).toBe('login');
  });
});
