/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope

const CACHE_NAME = 'reader-cache-v1'
const CHAPTER_CACHE_NAME = 'reader-chapters-v1'

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
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME && name !== CHAPTER_CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        })
    )
    // 立即接管所有页面
    self.clients.claim()
})

// 请求拦截
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url)

    // 章节内容请求 - 使用 Cache First 策略
    if (url.pathname.includes('/getBookContent')) {
        event.respondWith(
            caches.open(CHAPTER_CACHE_NAME).then(async (cache) => {
                // 尝试从缓存获取
                const cachedResponse = await cache.match(event.request)
                if (cachedResponse) {
                    // 后台更新缓存
                    fetch(event.request)
                        .then((response) => {
                            if (response.ok) {
                                cache.put(event.request, response.clone())
                            }
                        })
                        .catch(() => {
                            // 忽略网络错误
                        })
                    return cachedResponse
                }

                // 缓存未命中，从网络获取
                try {
                    const response = await fetch(event.request)
                    if (response.ok) {
                        cache.put(event.request, response.clone())
                    }
                    return response
                } catch (error) {
                    // 网络失败，返回离线提示
                    return new Response(
                        JSON.stringify({
                            isSuccess: false,
                            errorMsg: '网络不可用，且该章节未缓存'
                        }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    )
                }
            })
        )
        return
    }

    // 其他 API 请求 - Network First
    if (url.pathname.startsWith('/reader3/') || url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse
                        }
                        return new Response(
                            JSON.stringify({
                                isSuccess: false,
                                errorMsg: '网络不可用'
                            }),
                            {
                                status: 503,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        )
                    })
                })
        )
        return
    }

    // 静态资源 - Stale While Revalidate
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
                .then((response) => {
                    // 更新缓存
                    if (response.ok) {
                        const responseClone = response.clone()
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone)
                        })
                    }
                    return response
                })
                .catch((): Response => cachedResponse || new Response('Offline', { status: 503 }))

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
