let csrfToken = '';
export const setCsrfToken = (value: string) => {
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
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 25000),
    form = options.body instanceof FormData;
  try {
    const response = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      signal: options.signal || controller.signal,
      headers: {
        ...(options.body && !form ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: options.body
        ? form
          ? (options.body as FormData)
          : JSON.stringify(options.body)
        : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        response.status,
        payload?.error?.message || '请求失败，请稍后再试',
        payload?.error?.code,
      );
    if (!payload || !('data' in payload)) throw new ApiError(502, '服务返回格式不正确');
    return payload.data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === 'AbortError') throw new ApiError(408, '请求超时，请检查网络后重试');
    throw new ApiError(0, '无法连接后端服务，请确认后端已启动');
  } finally {
    clearTimeout(timeout);
  }
}
