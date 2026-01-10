/**
 * Service Worker - 离线优先缓存策略
 * 实现 stale-while-revalidate 策略和智能缓存管理
 */

const CACHE_VERSION = 'v1.0.0'
const CACHE_NAMES = {
  STATIC: `nexus-reader-static-${CACHE_VERSION}`,
  DYNAMIC: `nexus-reader-dynamic-${CACHE_VERSION}`,
  API: `nexus-reader-api-${CACHE_VERSION}`,
  IMAGES: `nexus-reader-images-${CACHE_VERSION}`,
}

// 缓存策略配置
const CACHE_STRATEGIES = {
  // 静态资源 - 缓存优先
  STATIC_ASSETS: {
    patterns: [/\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico)$/],
    cache: CACHE_NAMES.STATIC,
    strategy: 'cache-first',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30天
  },
  // API 请求 - 网络优先，离线时使用缓存
  API_REQUESTS: {
    patterns: [/\/api\//],
    cache: CACHE_NAMES.API,
    strategy: 'network-first',
    maxAge: 5 * 60 * 1000, // 5分钟
  },
  // 动态内容 - stale-while-revalidate
  DYNAMIC_CONTENT: {
    patterns: [/\/reader/, /\/search/, /\/discovery/],
    cache: CACHE_NAMES.DYNAMIC,
    strategy: 'stale-while-revalidate',
    maxAge: 24 * 60 * 60 * 1000, // 1天
  },
  // 图片 - 缓存优先，长期缓存
  IMAGES: {
    patterns: [/\.(?:png|jpg|jpeg|webp|gif|svg)$/],
    cache: CACHE_NAMES.IMAGES,
    strategy: 'cache-first',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
  },
}

// 预缓存资源列表
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
]

// 安装事件 - 预缓存关键资源
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...')
  
  event.waitUntil(
    caches.open(CACHE_NAMES.STATIC)
      .then((cache) => {
        console.log('Precaching static assets...')
        return cache.addAll(PRECACHE_URLS)
      })
      .then(() => {
        console.log('Service Worker installed successfully')
        // 强制激活新的 Service Worker
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error('Service Worker installation failed:', error)
      })
  )
})

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...')
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        const deletePromises = cacheNames
          .filter((cacheName) => {
            // 删除不属于当前版本的缓存
            return !Object.values(CACHE_NAMES).includes(cacheName)
          })
          .map((cacheName) => {
            console.log('Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          })
        
        return Promise.all(deletePromises)
      })
      .then(() => {
        console.log('Service Worker activated successfully')
        // 立即控制所有客户端
        return self.clients.claim()
      })
      .catch((error) => {
        console.error('Service Worker activation failed:', error)
      })
  )
})

// 拦截网络请求
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  
  // 只处理同源请求
  if (url.origin !== location.origin) {
    return
  }
  
  // 根据请求类型选择缓存策略
  const strategy = getCacheStrategy(request)
  if (strategy) {
    event.respondWith(handleRequest(request, strategy))
  }
})

// 获取请求对应的缓存策略
function getCacheStrategy(request) {
  const url = request.url
  
  for (const [name, config] of Object.entries(CACHE_STRATEGIES)) {
    if (config.patterns.some(pattern => pattern.test(url))) {
      return config
    }
  }
  
  return null
}

// 处理请求
async function handleRequest(request, strategy) {
  switch (strategy.strategy) {
    case 'cache-first':
      return cacheFirst(request, strategy)
    case 'network-first':
      return networkFirst(request, strategy)
    case 'stale-while-revalidate':
      return staleWhileRevalidate(request, strategy)
    default:
      return fetch(request)
  }
}

// 缓存优先策略
async function cacheFirst(request, strategy) {
  try {
    const cache = await caches.open(strategy.cache)
    const cachedResponse = await cache.match(request)
    
    if (cachedResponse) {
      // 检查缓存是否过期
      const cacheTime = await getCacheTime(request, strategy.cache)
      if (cacheTime && Date.now() - cacheTime < strategy.maxAge) {
        console.log('Cache hit (cache-first):', request.url)
        return cachedResponse
      }
    }
    
    // 缓存未命中或已过期，从网络获取
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone())
      await setCacheTime(request, strategy.cache, Date.now())
      console.log('Network response cached (cache-first):', request.url)
    }
    
    return networkResponse
  } catch (error) {
    console.error('Cache-first strategy failed:', error)
    // 降级到缓存（如果存在）
    const cache = await caches.open(strategy.cache)
    const cachedResponse = await cache.match(request)
    return cachedResponse || new Response('Network error', { status: 503 })
  }
}

// 网络优先策略
async function networkFirst(request, strategy) {
  try {
    const networkResponse = await fetch(request)
    
    if (networkResponse.ok) {
      const cache = await caches.open(strategy.cache)
      await cache.put(request, networkResponse.clone())
      await setCacheTime(request, strategy.cache, Date.now())
      console.log('Network response cached (network-first):', request.url)
    }
    
    return networkResponse
  } catch (error) {
    console.error('Network request failed, trying cache:', error)
    
    // 网络失败，尝试从缓存获取
    const cache = await caches.open(strategy.cache)
    const cachedResponse = await cache.match(request)
    
    if (cachedResponse) {
      console.log('Cache hit (network-first fallback):', request.url)
      return cachedResponse
    }
    
    return new Response('Network and cache unavailable', { status: 503 })
  }
}

// Stale-While-Revalidate 策略
async function staleWhileRevalidate(request, strategy) {
  const cache = await caches.open(strategy.cache)
  const cachedResponse = await cache.match(request)
  
  // 后台更新缓存
  const fetchPromise = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse.ok) {
        await cache.put(request, networkResponse.clone())
        await setCacheTime(request, strategy.cache, Date.now())
        console.log('Background cache update (stale-while-revalidate):', request.url)
      }
      return networkResponse
    })
    .catch((error) => {
      console.error('Background fetch failed:', error)
    })
  
  // 如果有缓存，立即返回缓存
  if (cachedResponse) {
    console.log('Cache hit (stale-while-revalidate):', request.url)
    return cachedResponse
  }
  
  // 没有缓存，等待网络响应
  try {
    return await fetchPromise
  } catch (error) {
    return new Response('Network error', { status: 503 })
  }
}

// 缓存时间管理
async function setCacheTime(request, cacheName, timestamp) {
  const timeCache = await caches.open(`${cacheName}-timestamps`)
  const timeResponse = new Response(timestamp.toString())
  await timeCache.put(request, timeResponse)
}

async function getCacheTime(request, cacheName) {
  try {
    const timeCache = await caches.open(`${cacheName}-timestamps`)
    const timeResponse = await timeCache.match(request)
    if (timeResponse) {
      const timestamp = await timeResponse.text()
      return parseInt(timestamp, 10)
    }
  } catch (error) {
    console.error('Failed to get cache time:', error)
  }
  return null
}

// 缓存清理 - 定期清理过期缓存
async function cleanupExpiredCache() {
  console.log('Starting cache cleanup...')
  
  for (const [name, config] of Object.entries(CACHE_STRATEGIES)) {
    try {
      const cache = await caches.open(config.cache)
      const requests = await cache.keys()
      
      for (const request of requests) {
        const cacheTime = await getCacheTime(request, config.cache)
        if (cacheTime && Date.now() - cacheTime > config.maxAge) {
          await cache.delete(request)
          console.log('Deleted expired cache:', request.url)
        }
      }
    } catch (error) {
      console.error('Cache cleanup failed for', name, error)
    }
  }
  
  console.log('Cache cleanup completed')
}

// 定期清理缓存（每小时）
setInterval(cleanupExpiredCache, 60 * 60 * 1000)

// 监听消息事件
self.addEventListener('message', (event) => {
  const { type, payload } = event.data
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break
      
    case 'GET_CACHE_STATS':
      getCacheStats().then((stats) => {
        event.ports[0].postMessage({ type: 'CACHE_STATS', payload: stats })
      })
      break
      
    case 'CLEAR_CACHE':
      clearCache(payload?.cacheName).then(() => {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED' })
      })
      break
      
    case 'PRECACHE_URLS':
      precacheUrls(payload?.urls || []).then(() => {
        event.ports[0].postMessage({ type: 'PRECACHE_COMPLETED' })
      })
      break
  }
})

// 获取缓存统计信息
async function getCacheStats() {
  const stats = {}
  
  for (const [name, cacheName] of Object.entries(CACHE_NAMES)) {
    try {
      const cache = await caches.open(cacheName)
      const requests = await cache.keys()
      let totalSize = 0
      
      for (const request of requests) {
        const response = await cache.match(request)
        if (response) {
          const blob = await response.blob()
          totalSize += blob.size
        }
      }
      
      stats[name] = {
        count: requests.length,
        size: totalSize,
      }
    } catch (error) {
      console.error('Failed to get cache stats for', name, error)
      stats[name] = { count: 0, size: 0 }
    }
  }
  
  return stats
}

// 清理指定缓存
async function clearCache(cacheName) {
  if (cacheName) {
    await caches.delete(cacheName)
    console.log('Cleared cache:', cacheName)
  } else {
    // 清理所有缓存
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map(name => caches.delete(name)))
    console.log('Cleared all caches')
  }
}

// 预缓存指定 URL
async function precacheUrls(urls) {
  const cache = await caches.open(CACHE_NAMES.STATIC)
  
  for (const url of urls) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        await cache.put(url, response)
        console.log('Precached:', url)
      }
    } catch (error) {
      console.error('Failed to precache:', url, error)
    }
  }
}

// 错误处理
self.addEventListener('error', (event) => {
  console.error('Service Worker error:', event.error)
})

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker unhandled rejection:', event.reason)
})

console.log('Service Worker loaded successfully')