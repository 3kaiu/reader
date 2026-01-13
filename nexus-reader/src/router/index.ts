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
    path: '/discovery',
    name: 'discovery',
    // 发现页面预取
    component: () => import(/* webpackPrefetch: true */ '@/pages/discovery.vue'),
    meta: { title: '发现' },
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
    meta: { title: 'AI 模型', feature: 'ai' },
  },
  {
    path: '/statistics',
    name: 'statistics',
    // 统计页面预取
    component: () => import(/* webpackPrefetch: true */ '@/pages/statistics.vue'),
    meta: { title: '阅读统计' },
  },
  {
    path: '/settings',
    name: 'settings',
    // 设置页面预取
    component: () => import(/* webpackPrefetch: true */ '@/pages/settings.vue'),
    meta: { title: '设置' },
  },
  {
    path: '/voice-settings',
    name: 'voice-settings',
    // 音色管理页面 - 按需加载（包含TTS依赖）
    component: () => import(/* webpackChunkName: "tts-features" */ '@/pages/voice-settings.vue'),
    meta: { title: '自定义音色', feature: 'tts' },
  },
  {
    path: '/ai-analysis-settings',
    name: 'ai-analysis-settings',
    // AI 分析助手页面 - 按需加载（包含AI依赖）
    component: () => import(/* webpackChunkName: "ai-features" */ '@/pages/ai-analysis-settings.vue'),
    meta: { title: '网文分析助手', feature: 'ai' },
  },
  {
    path: '/decoder-dictionary',
    name: 'decoder-dictionary',
    // 解密词典页面预取
    component: () => import(/* webpackPrefetch: true */ '@/pages/decoder-dictionary.vue'),
    meta: { title: '解密词典' },
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
