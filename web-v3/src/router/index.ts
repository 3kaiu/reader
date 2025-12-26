import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    // 首页预加载，减少首次加载时间
    component: () => import(/* webpackPreload: true */ '@/pages/index.vue'),
    meta: { title: '阅读', preload: true },
  },
  {
    path: '/reader',
    name: 'reader',
    // 阅读器页面预取，提升导航体验
    component: () => import(/* webpackPrefetch: true */ '@/pages/reader.vue'),
    meta: { title: '阅读', fullscreen: true },
  },
  {
    path: '/search',
    name: 'search',
    // 搜索页面预取
    component: () => import(/* webpackPrefetch: true */ '@/pages/search.vue'),
    meta: { title: '搜索' },
  },
  {
    path: '/sources',
    name: 'sources',
    // 书源管理页面预取
    component: () => import(/* webpackPrefetch: true */ '@/pages/sources.vue'),
    meta: { title: '书源管理' },
  },
  {
    path: '/replace-rule',
    name: 'replace-rule',
    // 替换规则页面预取
    component: () => import(/* webpackPrefetch: true */ '@/pages/replace-rule.vue'),
    meta: { title: '替换规则' },
  },
  {
    path: '/ai-settings',
    name: 'ai-settings',
    // AI 设置页面预取
    component: () => import(/* webpackPrefetch: true */ '@/pages/ai-settings.vue'),
    meta: { title: 'AI 模型' },
  },
  {
    path: '/settings',
    name: 'settings',
    // 设置页面预取
    component: () => import(/* webpackPrefetch: true */ '@/pages/settings.vue'),
    meta: { title: '设置' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// 路由守卫 - 设置页面标题
router.beforeEach((to, _from, next) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} - Reader`
  }
  next()
})

export default router
