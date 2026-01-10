import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import App from './App.vue'
import router from './router'
import './styles/main.css'
import { performanceMonitor } from './utils/performanceMonitor'
import { preloadManager } from './utils/lazyLoader'
import { swCacheManager } from './utils/cacheManager'
import { useErrorHandler } from './composables/useErrorHandler'
import { performanceSystem, initializePerformanceSystem } from './utils/performanceIntegration'

// 创建 Pinia 实例
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// 创建应用
const app = createApp(App)

// 注册插件
app.use(pinia)
app.use(router)

// 全局错误处理
app.config.errorHandler = (err, instance, info) => {
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

// 开启性能监控（向后兼容）
performanceMonitor.startMonitoring()

// 启动预加载管理器
preloadManager.preloadBasedOnNetwork()

// 初始化 Service Worker 缓存管理器
if (process.env.NODE_ENV === 'production') {
  swCacheManager
}

// 监控路由变化性能
router.beforeEach((to, from, next) => {
    const startTime = performance.now()
    ;(to.meta as any)._routeStartTime = startTime
    next()
})

router.afterEach((to, from) => {
    const startTime = (to.meta as any)._routeStartTime
    if (startTime) {
        const duration = performance.now() - startTime
        performanceMonitor.reportMetric('route_change', duration, {
            from: from.path,
            to: to.path
        })
    }
})

// 注册 Service Worker (仅在生产环境)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/sw.js')
            .then((registration) => {
                console.log('SW 注册成功:', registration.scope)
            })
            .catch((error) => {
                // Service Worker 注册失败（生产环境）
            })
    })
}

// 开发环境性能调试
if (import.meta.env.DEV) {
    // 添加全局性能调试函数
    (window as any).performanceSystem = performanceSystem
    (window as any).getPerformanceReport = () => performanceSystem.generatePerformanceReport()
    (window as any).optimizePerformance = () => performanceSystem.optimizePerformance()
    
    console.log('🔧 Performance debugging tools available:')
    console.log('  - window.performanceSystem: Access to performance system')
    console.log('  - window.getPerformanceReport(): Generate performance report')
    console.log('  - window.optimizePerformance(): Run performance optimization')
}
