import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { api, setCsrfToken } from '../src/services/api';
import { createApp } from 'vue';
import Markdown from '../src/components/Markdown.vue';
import { readUpload } from '../src/services/files';
beforeEach(() => setCsrfToken(''));
afterEach(() => vi.unstubAllGlobals());
it('HTTP 客户端发送同源 Cookie 和内存 CSRF，不把密钥放入地址', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  setCsrfToken('csrf-token');
  expect(await api('/posts', { method: 'POST', body: { title: '分享' } })).toEqual({ ok: true });
  const [url, options] = fetcher.mock.calls[0]!;
  expect(url).toBe('/api/posts');
  expect(options.credentials).toBe('same-origin');
  expect(options.headers['X-CSRF-Token']).toBe('csrf-token');
  expect(options.body).toBe(JSON.stringify({ title: '分享' }));
});
it('接口失败与异常响应能被统一识别', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: '没有操作权限', code: 'FORBIDDEN' } }), {
        status: 403,
      }),
    ),
  );
  await expect(api('/admin/users')).rejects.toMatchObject({ status: 403, message: '没有操作权限' });
});
it('网络失败有明确提示', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
  await expect(api('/bootstrap')).rejects.toMatchObject({
    status: 0,
    message: '无法连接后端服务，请确认后端已启动',
  });
});
it('网络中断后的同一业务重试复用幂等标识，成功后的新操作使用新标识', async () => {
  const ok = () => new Response(JSON.stringify({ data: { id: 'saved' } }), { status: 201 });
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('disconnected'))
    .mockImplementation(async () => ok());
  vi.stubGlobal('fetch', fetcher);
  const options = { method: 'POST', body: { title: '一次提问' } };
  await expect(api('/questions', options)).rejects.toMatchObject({ status: 0 });
  await api('/questions', options);
  await api('/questions', options);
  expect(fetcher.mock.calls[0]![1].headers['Idempotency-Key']).toBe(
    fetcher.mock.calls[1]![1].headers['Idempotency-Key'],
  );
  expect(fetcher.mock.calls[2]![1].headers['Idempotency-Key']).not.toBe(
    fetcher.mock.calls[1]![1].headers['Idempotency-Key'],
  );
});
it('Markdown 不执行脚本、事件属性和危险协议', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(Markdown, {
    content:
      '## 安全标题\n\n<script>alert(1)</script><img src="x" onerror="alert(1)">\n\n[链接](javascript:alert(1))',
  });
  app.mount(root);
  expect(root.querySelector('script')).toBeNull();
  expect(root.querySelector('[onerror]')).toBeNull();
  expect(root.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(root.querySelector('h2')?.textContent).toBe('安全标题');
  app.unmount();
  root.remove();
});
it('客户端初步拒绝禁止类型和超过 10MB 的附件', async () => {
  await expect(readUpload(new File(['bad'], 'bad.html', { type: 'text/html' }))).rejects.toThrow(
    '不支持',
  );
  await expect(
    readUpload(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.txt')),
  ).rejects.toThrow('10 MB');
  await expect(readUpload(new File(['not PDF'], 'bad.pdf'))).rejects.toThrow('不匹配');
});
