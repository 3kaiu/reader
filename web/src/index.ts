import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import App from './App.vue'
import router from './router'
import './styles/main.css'
import { useSettingsStore } from '@/stores/settings'
import {
  deriveChapterCachePolicyFromStorage,
  estimateBrowserStorage,
  requestPersistentBrowserStorage,
} from '@/utils/browserStorage'
import { logger } from '@/utils/logger'

declare module 'vue-router' {
  interface RouteMeta {
    _routeStartTime?: number
  }
}

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

const updateServiceWorkerChapterCachePolicy = async () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return
  }
  if (!settingsStore.config.offlinePersistenceEnabled) {
    return
  }

  const storageEstimate = await estimateBrowserStorage()
  const policy = deriveChapterCachePolicyFromStorage(storageEstimate)
  if (!policy) {
    return
  }

  const payload = {
    type: 'UPDATE_CHAPTER_CACHE_POLICY',
    maxEntries: policy.maxEntries,
    ttlMs: policy.ttlMs,
  }

  const postToWorker = (worker: ServiceWorker | null | undefined) => {
    if (!worker) {
      return false
    }
    worker.postMessage(payload)
    return true
  }

  if (postToWorker(navigator.serviceWorker.controller)) {
    return
  }

  try {
    const registration = await navigator.serviceWorker.ready
    postToWorker(registration.active || registration.waiting || registration.installing)
  } catch (error) {
    logger.debug('Service Worker not ready for chapter cache policy update', { error })
  }
}

if (settingsStore.config.offlinePersistenceEnabled) {
  void requestPersistentBrowserStorage()
    .then(granted => {
      if (granted === null) {
        return
      }
      logger.info('Persistent storage request completed', { granted })
      return updateServiceWorkerChapterCachePolicy()
    })
    .catch(error => {
      logger.warn('Persistent storage request failed', { error })
    })
}

// 全局错误处理
app.config.errorHandler = (err, _instance, info) => {
  logger.error('Vue error', { error: err, info })
  // 直接记录错误，避免在 entrypoint 中使用还未初始化的 composables
}

// 未捕获的 Promise 错误
window.addEventListener('unhandledrejection', event => {
  logger.error('Unhandled promise rejection', { reason: event.reason })
})

// 挂载应用
app.mount('#root')

// 注入 SVG feTurbulence 纸张纹理滤镜 (全局, 供阅读器氛围层使用)
function injectGrainFilter(): void {
  if (document.getElementById('ir-grain-svg')) return
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.id = 'ir-grain-svg'
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.position = 'absolute'
  svg.style.pointerEvents = 'none'
  svg.innerHTML = `<filter id="ir-grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer>
      <feFuncA type="linear" slope="0.04" intercept="0"/>
    </feComponentTransfer>
  </filter>`
  document.body.appendChild(svg)
}
injectGrainFilter()

// 监控路由变化性能
router.beforeEach((to, _from, next) => {
  const startTime = performance.now()
  to.meta._routeStartTime = startTime
  next()
})

router.afterEach((_to, _from) => {
  // Performance monitoring could be re-enabled here via new system
})

// 注册 Service Worker (仅在生产环境)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then(() => updateServiceWorkerChapterCachePolicy())
      .catch(_error => {
        // Service Worker 注册失败（生产环境）
      })
  })
}
