export type Role = 'student' | 'teacher' | 'admin';
export interface User {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  role: Role;
  email?: string;
  points: number;
  joined: string;
  status: 'active' | 'banned';
}
export interface Category {
  postCount?: number;
  enabled?: boolean;
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}
export interface Comment {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  parentId?: string;
}
export interface Post {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  type: string;
  authorId: string;
  createdAt: string;
  views: number;
  likes: string[];
  favorites: string[];
  comments: Comment[];
  featured: boolean;
  pinned: boolean;
  image?: string;
  status: 'published' | 'pending' | 'rejected';
  reviewReason?: string;
}
export interface Chapter {
  id: string;
  title: string;
  duration: string;
  content: string;
}
export interface Course {
  enrollmentCount?: number;
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  teacherId: string;
  image: string;
  visual: string;
  badge: string;
  rating: number;
  hours: number;
  level: string;
  tags: string[];
  chapters: Chapter[];
  createdAt: string;
}
export interface Enrollment {
  userId: string;
  courseId: string;
  completed: string[];
  lastChapter?: string;
  updatedAt: string;
}
export interface Answer {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  likes: string[];
  comments: Comment[];
}
export interface Question {
  id: string;
  title: string;
  content: string;
  authorId: string;
  category: string;
  tags: string[];
  createdAt: string;
  views: number;
  answers: Answer[];
  acceptedId?: string;
  favorites: string[];
  bounty: number;
  bountyStatus?: 'none' | 'held' | 'paid' | 'refunded';
}
export interface Resource {
  id: string;
  title: string;
  description: string;
  category: string;
  type: string;
  size: string;
  downloads: number;
  authorId: string;
  createdAt: string;
  tags: string[];
  favorites: string[];
  status: 'approved' | 'pending' | 'rejected';
  url?: string;
  filename: string;
}
export interface Notice {
  status?: 'draft' | 'published';
  id: string;
  title: string;
  content: string;
  type: string;
  createdAt: string;
  pinned: boolean;
}
export interface Notification {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: string;
  createdAt: string;
  read: boolean;
  link?: string;
}
export interface PointRecord {
  id: string;
  userId: string;
  reason: string;
  amount: number;
  createdAt: string;
}
export interface Conversation {
  kind?: 'draft' | 'chat';
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}
export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  createdAt: string;
}
export interface AppData {
  stats?: Record<string, number>;
  version: number;
  users: User[];
  posts: Post[];
  courses: Course[];
  questions: Question[];
  resources: Resource[];
  notices: Notice[];
  notifications: Notification[];
  enrollments: Enrollment[];
  checkins: { userId: string; date: string }[];
  points: PointRecord[];
  conversations: Conversation[];
  history: { userId: string; postId: string; date: string }[];
  logs: AuditLog[];
  pointRules: { checkin: number; post: number; answer: number; accepted: number; resource: number };
  categories: Category[];
}
