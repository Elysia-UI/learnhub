import type { User } from '../data/types';

export interface ChatMessage {
  id: string;
  clientId: string;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}

export interface ChatThread {
  peer: User;
  lastMessage: ChatMessage;
  unreadCount: number;
  canSend: boolean;
}

export interface MessagePage {
  peer: User;
  canSend: boolean;
  items: ChatMessage[];
  hasMore: boolean;
  peerReadUpTo: string;
}

export interface ThreadPage {
  items: ChatThread[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}

export interface PendingMessage {
  clientId: string;
  content: string;
  createdAt: string;
  status: 'sending' | 'failed';
  error: string;
}

// IDs are BIGINT strings. Comparing as Number could round different messages to
// the same value after a database has grown beyond Number.MAX_SAFE_INTEGER.
export function compareMessageIds(a: string, b: string) {
  const left = BigInt(a),
    right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  const rows = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => compareMessageIds(a.id, b.id));
}
