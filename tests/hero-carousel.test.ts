import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import HeroCarousel from '../src/components/HeroCarousel.vue';

vi.mock('../src/stores/community', () => ({ useCommunity: () => ({ modal: null }) }));
vi.mock('../src/components/Icon.vue', () => ({ default: { render: () => null } }));

class PendingImage {
  static requests: PendingImage[] = [];
  onload: (() => void | Promise<void>) | null = null;
  onerror: (() => void) | null = null;
  fetchPriority = 'auto';
  decoding = '';
  sizes = '';
  srcset = '';
  private source = '';
  decode = vi.fn(async () => undefined);
  set src(value: string) {
    this.source = value;
    if (value) PendingImage.requests.push(this);
  }
  get src() {
    return this.source;
  }
  async succeed() {
    await this.onload?.();
    await nextTick();
  }
  fail() {
    this.onerror?.();
  }
}

let app: App | undefined;
let root: HTMLElement;
let reduceMotion = false;
function mount() {
  app = createApp(HeroCarousel);
  app.component('RouterLink', {
    props: ['to'],
    setup(props, { slots }) {
      return () => h('a', { href: props.to }, slots.default?.());
    },
  });
  app.mount(root);
}
function loadFirst() {
  root.querySelector('img')!.dispatchEvent(new Event('load'));
}
function slide() {
  return root.querySelector('section')!.dataset.slide;
}
async function flush() {
  await Promise.resolve();
  await nextTick();
}

beforeEach(() => {
  vi.useFakeTimers();
  PendingImage.requests = [];
  reduceMotion = false;
  vi.stubGlobal('Image', PendingImage);
  vi.stubGlobal('matchMedia', () => ({
    matches: reduceMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  root.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('首页轮播在慢网下逐张加载', () => {
  it('首图加载完成前不请求其他横幅，下一张解码后才切换', async () => {
    mount();
    await vi.advanceTimersByTimeAsync(12000);
    expect(PendingImage.requests).toHaveLength(0);
    expect(root.querySelector('img')!.getAttribute('srcset')).toContain('hero-960.webp 960w');
    loadFirst();
    await vi.advanceTimersByTimeAsync(6000);
    expect(PendingImage.requests).toHaveLength(1);
    expect(PendingImage.requests[0]!.src).toBe('/images/optimized/library.webp');
    expect(PendingImage.requests[0]!.fetchPriority).toBe('low');
    expect(slide()).toBe('welcome');
    await PendingImage.requests[0]!.succeed();
    expect(slide()).toBe('learn');
    await vi.advanceTimersByTimeAsync(6000);
    expect(PendingImage.requests[1]!.src).toBe('/images/optimized/coding.webp');
  });

  it('悬停期间即使待加载图片返回也不自动切换，离开后重新计时', async () => {
    mount();
    loadFirst();
    await vi.advanceTimersByTimeAsync(6000);
    root.querySelector('section')!.dispatchEvent(new Event('mouseenter'));
    await nextTick();
    await PendingImage.requests[0]!.succeed();
    expect(slide()).toBe('welcome');
    root.querySelector('section')!.dispatchEvent(new Event('mouseleave'));
    await nextTick();
    await vi.advanceTimersByTimeAsync(5999);
    expect(slide()).toBe('welcome');
    await vi.advanceTimersByTimeAsync(1);
    expect(slide()).toBe('learn');
    expect(PendingImage.requests).toHaveLength(1);
  });

  it('图片失败保持当前画面，之后能够重试，离开页面会清理待处理加载', async () => {
    mount();
    loadFirst();
    await vi.advanceTimersByTimeAsync(6000);
    PendingImage.requests[0]!.fail();
    await flush();
    expect(slide()).toBe('welcome');
    await vi.advanceTimersByTimeAsync(6000);
    expect(PendingImage.requests).toHaveLength(2);
    const pending = PendingImage.requests[1]!;
    app!.unmount();
    app = undefined;
    expect(pending.onload).toBeNull();
    expect(pending.onerror).toBeNull();
    expect(pending.src).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('减少动态效果时停止自动加载，手动选图只应用最后一次选择', async () => {
    reduceMotion = true;
    mount();
    loadFirst();
    await vi.advanceTimersByTimeAsync(12000);
    expect(PendingImage.requests).toHaveLength(0);
    const buttons = root.querySelectorAll('.hero-pagination button');
    buttons[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    buttons[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(PendingImage.requests).toHaveLength(2);
    await PendingImage.requests[1]!.succeed();
    expect(slide()).toBe('community');
    await PendingImage.requests[0]!.succeed();
    expect(slide()).toBe('community');
    await vi.advanceTimersByTimeAsync(12000);
    expect(PendingImage.requests).toHaveLength(2);
  });
});
