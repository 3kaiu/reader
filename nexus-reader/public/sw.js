const CACHE_VERSION = 'reader-v3'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const API_CACHE = `${CACHE_VERSION}-api`
const CHAPTER_CACHE = `${CACHE_VERSION}-chapters`
const MODEL_CACHE = `${CACHE_VERSION}-models`
const ACTIVE_CACHES = [STATIC_CACHE, API_CACHE, CHAPTER_CACHE, MODEL_CACHE]

const STATIC_ASSETS = ['/', '/index.html']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name => !ACTIVE_CACHES.includes(name))
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  if (url.origin !== self.location.origin) {
    if (isModelAsset(url)) {
      event.respondWith(cacheFirst(request, MODEL_CACHE))
    }
    return
  }

  if (request.method !== 'GET') {
    if (isRuntimeRequest(url)) {
      event.respondWith(fetch(request))
    }
    return
  }

  if (isModelAsset(url)) {
    event.respondWith(cacheFirst(request, MODEL_CACHE))
    return
  }

  if (isChapterRequest(url)) {
    event.respondWith(cacheFirstWithRefresh(request, CHAPTER_CACHE))
    return
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE))
    return
  }

  if (isEdgeAddonRequest(url)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)))
    return
  }

  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE))
})

self.addEventListener('message', event => {
  if (event.origin && event.origin !== self.location.origin) {
    return
  }

  if (event.data?.type === 'CACHE_CHAPTER') {
    const { url, content } = event.data
    event.waitUntil(
      caches.open(CHAPTER_CACHE).then(cache => {
        const response = new Response(JSON.stringify({ isSuccess: true, data: content }), {
          headers: { 'Content-Type': 'application/json' },
        })
        return cache.put(url, response)
      })
    )
    return
  }

  if (event.data?.type === 'CLEAR_CHAPTER_CACHE') {
    event.waitUntil(caches.delete(CHAPTER_CACHE))
  }
})

function isModelAsset(url) {
  return (
    url.pathname.endsWith('.onnx') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.bin') ||
    url.pathname.endsWith('.data') ||
    url.hostname.includes('huggingface.co') ||
    url.pathname.includes('/onnx/') ||
    url.pathname.includes('/piper/')
  )
}

function isChapterRequest(url) {
  return url.pathname === '/api/content'
}

function isEdgeAddonRequest(url) {
  return (
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/decode/') ||
    url.pathname.startsWith('/progress/')
  )
}

function isRuntimeRequest(url) {
  return url.pathname.startsWith('/api/') || isEdgeAddonRequest(url)
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    return cached
  }

  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
  }
  return response
}

async function cacheFirstWithRefresh(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    void fetch(request)
      .then(response => {
        if (response.ok) {
          return cache.put(request, response.clone())
        }
        return undefined
      })
      .catch(() => {})
    return cached
  }

  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) {
      return cached
    }
    throw new Error('Offline')
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const networkFetch = fetch(request)
    .then(response => {
      if (response.ok) {
        void cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached || new Response('Offline', { status: 503 }))

  return cached || networkFetch
}
