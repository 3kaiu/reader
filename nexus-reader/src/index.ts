import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import App from './App.vue'
import router from './router'
import './styles/main.css'
import { perfMonitor } from './utils/performance'
import { useErrorHandler } from './composables/useErrorHandler'

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

// 开启性能监控
perfMonitor.observeWebVitals()

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
