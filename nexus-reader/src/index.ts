import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import App from './App.vue'
import router from './router'
import './styles/main.css'
import { useErrorHandler } from './composables/useErrorHandler'
import { performanceSystem, initializePerformanceSystem } from './services/performance/integration'
import { aiServiceManager } from './services/ai/service'

// 创建 Pinia 实例
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// 创建应用
const app = createApp(App)

// 注册插件
app.use(pinia)
app.use(router)

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

// 挂载
app.mount('#root')

// 初始化性能优化系统
initializePerformanceSystem({
    enableMonitoring: true,
    enableCaching: true,
    enableMemoryManagement: true,
    enableNetworkOptimization: true,
    enableOfflineSupport: import.meta.env.PROD, // 仅在生产环境启用离线支持
    enableBudgetEnforcement: import.meta.env.DEV, // 仅在开发环境启用预算检查
    enableAnimationOptimization: true,
    enableSmoothScrolling: true,
    enableFontOptimization: true,
    enableThemeTransitions: true,
    enableTesting: import.meta.env.DEV, // 仅在开发环境启用测试

    // 具体配置
    monitoringConfig: {
        sampleRate: import.meta.env.PROD ? 0.1 : 1, // 生产环境降低采样率
        enableRealTimeReporting: import.meta.env.DEV
    },

    cacheConfig: {
        maxSize: 100 * 1024 * 1024, // 100MB
        ttl: 3600000 // 1小时
    },

    memoryConfig: {
        gcThreshold: 150 * 1024 * 1024, // 150MB
        monitoringInterval: 30000 // 30秒
    },

    networkConfig: {
        enableAdaptiveQuality: true,
        enableRequestBatching: true
    },

    budgetConfig: {
        enforceInProduction: false,
        alertThreshold: 0.8
    }
}).catch(error => {
    console.error('Failed to initialize performance system:', error)
})

// 初始化 AI 服务管理器
aiServiceManager.initialize().catch(error => {
    console.warn('AI service initialization failed:', error)
})


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
