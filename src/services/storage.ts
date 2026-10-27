// Only theme preferences and unsent drafts use browser storage. Business records use the API.
export function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}
export function dayKey() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
}
