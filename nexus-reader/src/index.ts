import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import App from './App.vue'
import router from './router'
import './styles/main.css'
import { initDomainLayer } from './domain'
import { initOptimizerManager } from '@/utils/unified-utils'
import { useUserStore, useSettingsStore } from '@/stores/unified'

// 创建 Pinia 实例
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// 创建应用
const app = createApp(App)

// 注册插件
app.use(pinia)
app.use(router)

// 初始化领域层
const domainLayer = initDomainLayer()

// 初始化优化器管理器
initOptimizerManager({
    enableMemoryOptimization: true,
    enableCpuOptimization: true,
    enableIoOptimization: true,
    enableNetworkOptimization: true,
    enableCacheOptimization: true,
    enableAlgorithmOptimization: true,
    monitoringIntervalMs: 30000,
    optimizationIntervalMs: 300000,
    maxConcurrentOptimizations: 3,
})

// 初始化Pinia stores
const userStore = useUserStore()
const settingsStore = useSettingsStore()

// 加载用户设置
settingsStore.loadFromConfig()

// 全局错误处理
app.config.errorHandler = (err, _instance, info) => {
    console.error('[Vue Error]', err, info)
    const { handleError } = useErrorHandler()
    handleError(err, `Vue Error: ${info}`)
}

// 未捕获的 Promise 错误
window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Promise Rejection]', event.reason)
})

// 挂载应用
app.mount('#root')


// 监控路由变化性能
router.beforeEach((to, from, next) => {
    const startTime = performance.now()
        ; (to.meta as any)._routeStartTime = startTime
    next()
})

router.afterEach((to, _from) => {
    // Performance monitoring could be re-enabled here via new system
})

// 注册 Service Worker (仅在生产环境)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/sw.js')
            .then((registration) => {
                console.log('SW 注册成功:', registration.scope)
            })
            .catch((_error) => {
                // Service Worker 注册失败（生产环境）
            })
    })
}

// 开发环境性能调试
if (import.meta.env.DEV) {
    // 暴露调试对象到 window（仅开发环境）
    Object.assign(window, {
        performanceSystem,
        aiServiceManager
    })

    console.log('🔧 Debug objects available: window.performanceSystem, window.aiServiceManager')
}
