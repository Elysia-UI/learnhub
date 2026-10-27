import { createRouter, createWebHistory } from 'vue-router';
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/HomeView.vue'), meta: { title: '首页' } },
    {
      path: '/forum',
      component: () => import('./views/ForumView.vue'),
      meta: { title: '交流论坛' },
    },
    {
      path: '/forum/new',
      component: () => import('./views/EditorView.vue'),
      meta: { title: '发布帖子' },
    },
    {
      path: '/forum/:id/edit',
      component: () => import('./views/EditorView.vue'),
      meta: { title: '编辑帖子' },
    },
    {
      path: '/forum/:id',
      component: () => import('./views/PostView.vue'),
      meta: { title: '讨论详情' },
    },
    {
      path: '/courses',
      component: () => import('./views/CoursesView.vue'),
      meta: { title: '课程中心' },
    },
    {
      path: '/courses/:id',
      component: () => import('./views/CourseView.vue'),
      meta: { title: '课程详情' },
    },
    {
      path: '/resources',
      component: () => import('./views/ResourcesView.vue'),
      meta: { title: '学习资源' },
    },
    {
      path: '/resources/:id',
      component: () => import('./views/ResourceView.vue'),
      meta: { title: '资源详情' },
    },
    {
      path: '/questions',
      component: () => import('./views/QuestionsView.vue'),
      meta: { title: '学习问答' },
    },
    {
      path: '/questions/:id',
      component: () => import('./views/QuestionView.vue'),
      meta: { title: '问答详情' },
    },
    {
      path: '/profile',
      component: () => import('./views/ProfileView.vue'),
      meta: { title: '个人中心' },
    },
    {
      path: '/members/:id',
      component: () => import('./views/ProfileView.vue'),
      meta: { title: '社区伙伴' },
    },
    { path: '/ai', component: () => import('./views/AIView.vue'), meta: { title: 'AI 学习助手' } },
    {
      path: '/admin',
      component: () => import('./views/AdminView.vue'),
      meta: { title: '后台管理' },
    },
    {
      path: '/notifications',
      component: () => import('./views/NotificationsView.vue'),
      meta: { title: '消息通知' },
    },
    {
      path: '/search',
      component: () => import('./views/SearchView.vue'),
      meta: { title: '全站搜索' },
    },
    {
      path: '/:section(categories|topics|announcements|leaderboard)',
      component: () => import('./views/DiscoverView.vue'),
      meta: { title: '发现社区' },
    },
    {
      path: '/:pathMatch(.*)*',
      component: () => import('./views/NotFoundView.vue'),
      meta: { title: '页面未找到' },
    },
  ],
});
export default router;
