import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import App from './App.vue'
import router from './router'
import './styles/main.css'
import { useSettingsStore } from '@/stores/settings'

// 创建 Pinia 实例
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// 创建应用
const app = createApp(App)

// 注册插件
app.use(pinia)
app.use(router)

// 初始化Pinia stores
const settingsStore = useSettingsStore()

// 加载用户设置
settingsStore.loadFromConfig()

// 全局错误处理
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue Error]', err, info)
  // 直接记录错误，避免在 entrypoint 中使用还未初始化的 composables
}

// 未捕获的 Promise 错误
window.addEventListener('unhandledrejection', event => {
  console.error('[Unhandled Promise Rejection]', event.reason)
})

// 挂载应用
app.mount('#root')

// 监控路由变化性能
router.beforeEach((to, _from, next) => {
  const startTime = performance.now()
  ;(to.meta as any)._routeStartTime = startTime
  next()
})

router.afterEach((_to, _from) => {
  // Performance monitoring could be re-enabled here via new system
})

// 注册 Service Worker (仅在生产环境)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(registration => {
        console.log('SW 注册成功:', registration.scope)
      })
      .catch(_error => {
        // Service Worker 注册失败（生产环境）
      })
  })
}

// 开发环境性能调试
if (import.meta.env.DEV) {
  // 暴露调试对象到 window（仅开发环境）
  Object.assign(window, {
    aiServiceManager: (window as any).aiServiceManager,
  })
}
