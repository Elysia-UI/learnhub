import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { AppData, User, Post, Question, Resource, Course } from '../data/types';
import { api, ApiError, setCsrfToken } from '../services/api';
import { dayKey } from '../services/storage';
const emptyData = (): AppData => ({
  version: 2,
  users: [],
  categories: [],
  posts: [],
  questions: [],
  courses: [],
  resources: [],
  notices: [],
  notifications: [],
  enrollments: [],
  checkins: [],
  points: [],
  history: [],
  logs: [],
  conversations: [],
  pointRules: { checkin: 0, post: 0, answer: 0, accepted: 0, resource: 0 },
});
export const useCommunity = defineStore('community', () => {
  const data = ref<AppData>(emptyData()),
    sessionId = ref(''),
    theme = ref(localStorage.getItem('learnhub.theme') || 'light');
  const ready = ref(false),
    loading = ref(false),
    loadError = ref(''),
    pending = ref(0);
  const toast = ref<{ text: string; type: string } | null>(null),
    modal = ref<{ type: string; payload?: any } | null>(null),
    mobileMenu = ref(false);
  let toastTimer: ReturnType<typeof setTimeout>;
  const currentUser = computed(() =>
    data.value.users.find((u) => u.id === sessionId.value && u.status === 'active'),
  );
  const unread = computed(() => data.value.notifications.filter((n) => !n.read).length);
  const checkedToday = computed(() =>
    data.value.checkins.some((c) => c.userId === currentUser.value?.id && c.date === dayKey()),
  );
  const fallbackUser: User = {
    id: '',
    name: '社区伙伴',
    avatar: '',
    bio: '',
    role: 'student',
    points: 0,
    joined: new Date(0).toISOString(),
    status: 'active',
  };
  const user = (id: string) => data.value.users.find((u) => u.id === id) || fallbackUser;
  const category = (id: string) => data.value.categories.find((c) => c.id === id);
  function notify(text: string, type = 'success') {
    toast.value = { text, type };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.value = null), 3500);
  }
  watch(
    theme,
    (value) => {
      document.documentElement.dataset.theme = value;
      localStorage.setItem('learnhub.theme', value);
    },
    { immediate: true },
  );
  function requireUser() {
    if (!currentUser.value) {
      modal.value = { type: 'login' };
      return false;
    }
    return true;
  }
  async function refresh() {
    loading.value = true;
    loadError.value = '';
    try {
      const result = await api<{ state: AppData; user: { id: string } | null; csrfToken: string }>(
        '/bootstrap',
      );
      data.value = result.state;
      sessionId.value = result.user?.id || '';
      setCsrfToken(result.csrfToken);
      ready.value = true;
    } catch (e) {
      loadError.value = (e as Error).message;
      throw e;
    } finally {
      loading.value = false;
    }
  }
  async function initialize() {
    try {
      await refresh();
    } catch {
      /* Display a retry control; never fall back to browser business data. */
    }
  }
  async function mutate<T>(
    path: string,
    method: string,
    body?: unknown,
    message?: string,
  ): Promise<T> {
    pending.value++;
    try {
      const value = await api<T>(path, { method, body });
      await refresh();
      if (message) notify(message);
      return value;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        sessionId.value = '';
        setCsrfToken('');
        modal.value = { type: 'login' };
      }
      notify((e as Error).message, 'error');
      throw e;
    } finally {
      pending.value--;
    }
  }
  async function action(path: string, method: string, body?: unknown, message?: string) {
    try {
      return await mutate(path, method, body, message);
    } catch {
      return undefined;
    }
  }
  async function login(email: string, password: string, name?: string) {
    const result = await api<{ user: User; csrfToken: string }>(
      name ? '/auth/register' : '/auth/login',
      { method: 'POST', body: name ? { email, password, name } : { email, password } },
    );
    setCsrfToken(result.csrfToken);
    await refresh();
    modal.value = null;
    notify(name ? '注册成功，欢迎加入知学社区' : '登录成功，欢迎回来');
  }
  async function logout() {
    try {
      await mutate('/auth/logout', 'POST');
      notify('已退出登录');
    } catch {
      return;
    }
  }
  const saveProfile = (input: { name: string; bio: string; avatar?: string }) =>
    mutate('/auth/profile', 'PATCH', input, '个人资料已保存');
  async function savePost(
    input: Pick<Post, 'title' | 'content' | 'category' | 'tags' | 'type' | 'image'>,
    id?: string,
  ) {
    if (!requireUser()) return;
    const value = await mutate<{ id: string }>(
      id ? `/posts/${id}` : '/posts',
      id ? 'PATCH' : 'POST',
      input,
      id ? '帖子已更新' : '帖子发布成功',
    );
    return value.id;
  }
  const deletePost = (id: string) => mutate(`/posts/${id}`, 'DELETE', undefined, '帖子已删除');
  async function commentPost(post: Post, content: string, parentId?: string) {
    if (!requireUser()) return;
    return mutate(`/posts/${post.id}/comments`, 'POST', { content, parentId }, '评论发布成功');
  }
  const deleteComment = (id: string) =>
    mutate(`/comments/${id}`, 'DELETE', undefined, '评论已删除');
  async function likePost(post: Post) {
    if (!requireUser()) return;
    return action(`/posts/${post.id}/like`, 'PUT', {
      active: !post.likes.includes(sessionId.value),
    });
  }
  async function favorite(list: string[]) {
    if (!requireUser()) return;
    const post = data.value.posts.find((p) => p.favorites === list),
      question = data.value.questions.find((q) => q.favorites === list),
      resource = data.value.resources.find((r) => r.favorites === list);
    const path = post
      ? `/posts/${post.id}/favorite`
      : question
        ? `/questions/${question.id}/favorite`
        : resource
          ? `/resources/${resource.id}/favorite`
          : '';
    if (path)
      return action(
        path,
        'PUT',
        { active: !list.includes(sessionId.value) },
        list.includes(sessionId.value) ? '已取消收藏' : '已加入我的收藏',
      );
  }
  async function toggle(list: string[]) {
    if (!requireUser()) return;
    for (const q of data.value.questions) {
      const a = q.answers.find((a) => a.likes === list);
      if (a)
        return action(`/answers/${a.id}/like`, 'PUT', { active: !list.includes(sessionId.value) });
    }
  }
  async function visitPost(id: string) {
    try {
      const post = await api<Post>(`/posts/${id}`);
      const index = data.value.posts.findIndex((p) => p.id === id);
      if (index < 0) data.value.posts.unshift(post);
      else data.value.posts[index] = post;
      await api(`/posts/${id}/view`, { method: 'POST' });
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  async function checkin() {
    if (!requireUser()) return;
    const result = await action('/checkins', 'POST');
    if (result) notify('签到已保存到云数据库');
  }
  async function saveQuestion(
    input: Pick<Question, 'title' | 'content' | 'category' | 'tags'>,
    id?: string,
  ) {
    if (!requireUser()) return;
    const value = await mutate<{ id: string }>(
      id ? `/questions/${id}` : '/questions',
      id ? 'PATCH' : 'POST',
      input,
      id ? '问题已更新' : '问题已发布',
    );
    return value.id;
  }
  async function answer(question: Question, content: string) {
    if (!requireUser()) return;
    return mutate(`/questions/${question.id}/answers`, 'POST', { content }, '回答发布成功');
  }
  const accept = (question: Question, answerId: string) =>
    mutate(`/questions/${question.id}/accept`, 'POST', { answerId }, '已采纳为最佳答案');
  const answerComment = (id: string, content: string) =>
    mutate(`/answers/${id}/comments`, 'POST', { content }, '评论发布成功');
  async function enroll(course: Course) {
    if (!requireUser()) return;
    return mutate(`/courses/${course.id}/enroll`, 'POST', undefined, '已加入课程');
  }
  const progress = (courseId: string) =>
    data.value.enrollments.find((e) => e.courseId === courseId && e.userId === sessionId.value);
  const learnChapter = (courseId: string, chapterId: string) =>
    action(`/courses/${courseId}/progress`, 'PUT', { chapterId, completed: false });
  const complete = (course: Course, chapterId: string) =>
    action(
      `/courses/${course.id}/progress`,
      'PUT',
      { chapterId, completed: true },
      '本节完成记录已保存',
    );
  const saveCourse = (input: unknown, id?: string) =>
    mutate<{ id: string }>(
      id ? `/courses/${id}` : '/courses',
      id ? 'PATCH' : 'POST',
      input,
      '课程已保存',
    );
  const addResource = (form: FormData) =>
    mutate<{ id: string }>('/resources', 'POST', form, '资源已提交，等待管理员审核');
  const uploadAvatar = (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api<{ url: string }>('/uploads', { method: 'POST', body: form });
  };
  const approveResource = (resource: Resource, approved: boolean) =>
    action(`/admin/resources/${resource.id}/review`, 'POST', { approved }, '审核结果已保存');
  const adminChange = (path: string, method: string, body?: unknown) =>
    mutate(`/admin${path}`, method, body, '管理操作已保存');
  const markRead = (id?: string) =>
    action(id ? `/notifications/${id}/read` : '/notifications/read', 'PATCH');
  const deleteNotification = (id: string) =>
    action(`/notifications/${id}`, 'DELETE', undefined, '消息已删除');
  const saveConversation = (content: string, id?: string) =>
    mutate<{ id: string }>('/ai/drafts', 'POST', { id, content }, '学习草稿已保存到云端');
  const deleteConversation = (id: string) =>
    mutate(`/ai/drafts/${id}`, 'DELETE', undefined, '草稿已删除');
  return {
    data,
    sessionId,
    theme,
    ready,
    loading,
    loadError,
    pending,
    currentUser,
    unread,
    checkedToday,
    toast,
    modal,
    mobileMenu,
    user,
    category,
    notify,
    requireUser,
    refresh,
    initialize,
    login,
    logout,
    saveProfile,
    savePost,
    deletePost,
    commentPost,
    deleteComment,
    likePost,
    favorite,
    toggle,
    visitPost,
    checkin,
    saveQuestion,
    answer,
    accept,
    answerComment,
    enroll,
    progress,
    learnChapter,
    complete,
    saveCourse,
    addResource,
    uploadAvatar,
    approveResource,
    adminChange,
    markRead,
    deleteNotification,
    saveConversation,
    deleteConversation,
  };
});
