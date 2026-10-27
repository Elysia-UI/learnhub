let csrfToken = '';
const retryKeys = new Map<string, string>();
export const setCsrfToken = (value: string) => {
  if (value !== csrfToken) retryKeys.clear();
  csrfToken = value;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function streamChat(
  id: string,
  body: { content: string; requestKey: string },
  onEvent: (event: any) => void,
  signal: AbortSignal,
) {
  const response = await fetch('/api/ai/conversations/' + encodeURIComponent(id) + '/messages', {
    method: 'POST',
    credentials: 'same-origin',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(response.status, payload?.error?.message || 'AI 调用失败');
  }
  if (!response.body) throw new ApiError(502, '模型没有返回数据');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    done = false;
  function line(text: string) {
    if (!text.trim()) return;
    const event = JSON.parse(text);
    onEvent(event);
    if (event.type === 'done') done = true;
    if (event.type === 'error') throw new ApiError(502, event.message || '生成失败，请重试');
  }
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      buffer += decoder.decode(r.value, { stream: true });
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) line(buffer);
    if (!done) throw new ApiError(502, '连接已中断，可以重试这条消息');
  } finally {
    reader.releaseLock();
  }
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    requestKey?: string;
    timeout?: number;
  } = {},
): Promise<T> {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), options.timeout || 25000),
    form = options.body instanceof FormData;
  const repeatable =
    options.method === 'POST' &&
    !form &&
    (/^\/(posts|questions)$/.test(path) ||
      /^\/(posts|questions|answers)\/[^/]+\/(comments|answers)$/.test(path));
  const signature = repeatable ? path + ':' + JSON.stringify(options.body) : '';
  const requestKey =
    options.requestKey || (signature && retryKeys.get(signature)) || crypto.randomUUID();
  if (signature) {
    retryKeys.set(signature, requestKey);
    if (retryKeys.size > 100) retryKeys.delete(retryKeys.keys().next().value!);
  }
  try {
    const response = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      signal: options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal,
      headers: {
        ...(options.body && !form ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(options.method === 'POST' && !form ? { 'Idempotency-Key': requestKey } : {}),
      },
      body: options.body
        ? form
          ? (options.body as FormData)
          : JSON.stringify(options.body)
        : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (
        signature &&
        response.status >= 400 &&
        response.status < 500 &&
        ![408, 429].includes(response.status)
      )
        retryKeys.delete(signature);
      throw new ApiError(
        response.status,
        payload?.error?.message || '请求失败，请稍后再试',
        payload?.error?.code,
      );
    }
    if (!payload || !('data' in payload)) throw new ApiError(502, '服务返回格式不正确');
    if (signature) retryKeys.delete(signature);
    return payload.data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === 'AbortError') throw new ApiError(408, '请求超时，请检查网络后重试');
    throw new ApiError(0, '无法连接后端服务，请确认后端已启动');
  } finally {
    clearTimeout(timeout);
  }
}
