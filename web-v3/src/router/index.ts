import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/index.vue'),
    meta: { title: '阅读' },
  },
  {
    path: '/reader',
    name: 'reader',
    component: () => import('@/pages/reader.vue'),
    meta: { title: '阅读', fullscreen: true },
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('@/pages/search.vue'),
    meta: { title: '搜索' },
  },
  {
    path: '/sources',
    name: 'sources',
    component: () => import('@/pages/sources.vue'),
    meta: { title: '书源管理' },
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
