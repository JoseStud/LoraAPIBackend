import { createRouter, createWebHistory } from 'vue-router';

const historyBase =
  typeof import.meta.env.BASE_URL === 'string' && import.meta.env.BASE_URL.length > 0
    ? import.meta.env.BASE_URL
    : '/';

const router = createRouter({
  history: createWebHistory(historyBase),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/loras',
      name: 'loras',
      component: () => import('@/views/LorasView.vue'),
    },
    {
      path: '/recommendations',
      name: 'recommendations',
      component: () => import('@/views/RecommendationsView.vue'),
    },
    {
      path: '/compose',
      name: 'compose',
      component: () => import('@/views/ComposeView.vue'),
    },
    {
      path: '/generate',
      name: 'generate',
      component: () => import('@/views/GenerateView.vue'),
    },
    {
      path: '/generate/composition-example',
      name: 'generate-composition-example',
      component: () => import('@/views/GenerateCompositionExampleView.vue'),
      alias: '/generate-composition-example',
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('@/views/HistoryView.vue'),
    },
    {
      path: '/import-export',
      name: 'import-export',
      component: () => import('@/views/ImportExportView.vue'),
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
    },
    {
      path: '/analytics',
      name: 'analytics',
      component: () => import('@/views/analytics/PerformanceAnalyticsPage.vue'),
    },
    {
      path: '/offline',
      name: 'offline',
      component: () => import('@/views/OfflineView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

export default router;
