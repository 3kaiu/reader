import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { isOptionalFeature, isOptionalFeatureEnabled } from '@/utils/features'

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
    path: '/discovery',
    name: 'discovery',
    // 可选发现页按需加载
    component: () => import('@/pages/discovery.vue'),
    meta: { title: '发现', feature: 'discovery' },
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
    // AI 设置页面 - 按需加载（包含大依赖）
    component: () => import(/* webpackChunkName: "ai-features" */ '@/pages/ai-settings.vue'),
    meta: { title: '本地 AI 模型', feature: 'ai' },
  },
  {
    path: '/settings',
    name: 'settings',
    // 设置页面预取
    component: () => import(/* webpackPrefetch: true */ '@/pages/settings.vue'),
    meta: { title: '设置' },
  },
  {
    path: '/source-builder-debug',
    name: 'source-builder-debug',
    component: () => import(/* webpackPrefetch: true */ '@/pages/source-builder-debug.vue'),
    meta: { title: 'Source Builder Debug' },
  },
  {
    path: '/ai-analysis-settings',
    name: 'ai-analysis-settings',
    // AI 分析助手页面 - 按需加载（包含AI依赖）
    component: () => import(/* webpackChunkName: "ai-features" */ '@/pages/ai-analysis-settings.vue'),
    meta: { title: 'AI 映射规则', feature: 'ai' },
  },
  {
    path: '/decoder-dictionary',
    name: 'decoder-dictionary',
    // 解密词典页按需加载
    component: () => import('@/pages/decoder-dictionary.vue'),
    meta: { title: '解密词典', feature: 'decoder' },
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

  if (typeof to.meta?.feature === 'string' && isOptionalFeature(to.meta.feature)) {
    if (!isOptionalFeatureEnabled(to.meta.feature)) {
      next({ name: 'settings', query: { addon: to.meta.feature } })
      return
    }
  }

  next()
})

export default router
