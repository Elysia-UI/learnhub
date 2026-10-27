export const count = (n: number) =>
  n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
export const date = (value: string) =>
  new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
export function timeAgo(value: string) {
  const h = Math.max(0, (Date.now() - new Date(value).getTime()) / 3600000);
  return h < 1
    ? '刚刚'
    : h < 24
      ? `${Math.floor(h)} 小时前`
      : h < 24 * 7
        ? `${Math.floor(h / 24)} 天前`
        : date(value);
}
export const level = (points: number) => Math.min(10, Math.floor(points / 30) + 1);
export const roleName = (role?: string) =>
  role === 'admin' ? '管理员' : role === 'teacher' ? '教师' : '同学';
