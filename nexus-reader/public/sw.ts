/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope

// 缓存版本管理
const CACHE_VERSION = 2
const CACHE_NAME = `reader-cache-v${CACHE_VERSION}`
const CHAPTER_CACHE_NAME = `reader-chapters-v${CACHE_VERSION}`
const MODEL_CACHE_NAME = `reader-models-v${CACHE_VERSION}`

// 最大缓存数量限制（防止缓存无限增长）
const MAX_CACHE_ITEMS = 100
const MAX_CHAPTER_CACHE_ITEMS = 50

// 需要预缓存的静态资源
const STATIC_ASSETS = [
    '/',
    '/index.html',
]

// 安装事件 - 预缓存静态资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS)
        })
    )
    // 立即激活新的 Service Worker
    self.skipWaiting()
})

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            // 删除所有旧版本的缓存
            const deletePromises = cacheNames
                .filter((name) => {
                    // 删除所有不是当前版本的缓存
                    return !name.startsWith(`reader-cache-v${CACHE_VERSION}`) &&
                        !name.startsWith(`reader-chapters-v${CACHE_VERSION}`) &&
                        !name.startsWith(`reader-models-v${CACHE_VERSION}`)
                })
                .map((name) => caches.delete(name))
            return Promise.all(deletePromises)
        })
    )
    // 立即接管所有页面
    self.clients.claim()
})

// 请求拦截
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url)

    // 1. AI/TTS 模型与权重文件 - Cache First (最优先，文件大，变化少)
    const isModelAsset =
        url.pathname.endsWith('.onnx') ||
        url.pathname.endsWith('.wasm') ||
        url.pathname.endsWith('.bin') ||
        url.pathname.endsWith('.data') ||
        url.hostname.includes('huggingface.co') ||
        url.pathname.includes('/onnx/') ||
        url.pathname.includes('/piper/')

    if (isModelAsset) {
        event.respondWith(
            caches.match(event.request).then(async (cachedResponse) => {
                if (cachedResponse) return cachedResponse

                try {
                    const response = await fetch(event.request)
                    if (response.ok) {
                        const cache = await caches.open(MODEL_CACHE_NAME)
                        cache.put(event.request, response.clone())
                    }
                    return response
                } catch (e) {
                    return new Response('Model Offline', { status: 503 })
                }
            })
        )
        return
    }

    // 2. 章节内容请求 - 使用 Cache First + Background Sync
    if (url.pathname.includes('/getBookContent')) {
        event.respondWith(
            caches.open(CHAPTER_CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(event.request)
                if (cachedResponse) {
                    fetch(event.request).then(r => { if (r.ok) cache.put(event.request, r) }).catch(() => { })
                    return cachedResponse
                }
                const response = await fetch(event.request)
                if (response.ok) cache.put(event.request, response.clone())
                return response
            })
        )
        return
    }

    // 3. API 请求 - Network First
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        )
        return
    }

    // 4. 通用静态资源 - Stale While Revalidate
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()))
                    }
                    return response
                })
                .catch(() => cachedResponse || new Response('Offline', { status: 503 }))

            return cachedResponse || fetchPromise
        })
    )
})

// 接收来自主线程的消息
self.addEventListener('message', (event) => {
    if (event.data.type === 'CACHE_CHAPTER') {
        const { url, content } = event.data
        caches.open(CHAPTER_CACHE_NAME).then((cache) => {
            const response = new Response(JSON.stringify({ isSuccess: true, data: content }), {
                headers: { 'Content-Type': 'application/json' }
            })
            cache.put(url, response)
        })
    }

    if (event.data.type === 'CLEAR_CHAPTER_CACHE') {
        caches.delete(CHAPTER_CACHE_NAME)
    }
})

export { }
