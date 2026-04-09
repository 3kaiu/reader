const CACHE_VERSION = 'reader-v4'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const API_CACHE = `${CACHE_VERSION}-api`
const CHAPTER_CACHE = `${CACHE_VERSION}-chapters`
const CHAPTER_META_CACHE = `${CACHE_VERSION}-chapters-meta`
const MODEL_CACHE = `${CACHE_VERSION}-models`
const ACTIVE_CACHES = [STATIC_CACHE, API_CACHE, CHAPTER_CACHE, CHAPTER_META_CACHE, MODEL_CACHE]
let CHAPTER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7
let CHAPTER_CACHE_MAX_ENTRIES = 600
const CHAPTER_CACHE_PRUNE_INTERVAL_MS = 1000 * 60 * 3
let lastChapterCachePruneAt = 0

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
    event.respondWith(chapterCacheFirstWithRefresh(request))
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
      Promise.all([
        caches.open(CHAPTER_CACHE),
        caches.open(CHAPTER_META_CACHE),
      ]).then(([chapterCache, chapterMetaCache]) => {
        const response = withChapterCacheHeaders(
          new Response(JSON.stringify({ isSuccess: true, data: content }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )
        return Promise.all([
          chapterCache.put(url, response),
          writeChapterCacheMetadata(chapterMetaCache, url),
          maybePruneChapterCache(chapterCache, chapterMetaCache),
        ])
      }),
    )
    return
  }

  if (event.data?.type === 'CLEAR_CHAPTER_CACHE') {
    event.waitUntil(Promise.all([caches.delete(CHAPTER_CACHE), caches.delete(CHAPTER_META_CACHE)]))
    return
  }

  if (event.data?.type === 'UPDATE_CHAPTER_CACHE_POLICY') {
    const maxEntries = Number(event.data.maxEntries)
    const ttlMs = Number(event.data.ttlMs)
    if (Number.isFinite(maxEntries) && maxEntries > 0) {
      CHAPTER_CACHE_MAX_ENTRIES = Math.max(100, Math.min(2000, Math.trunc(maxEntries)))
    }
    if (Number.isFinite(ttlMs) && ttlMs > 0) {
      CHAPTER_CACHE_TTL_MS = Math.max(
        1000 * 60 * 60 * 6,
        Math.min(1000 * 60 * 60 * 24 * 30, Math.trunc(ttlMs))
      )
    }
    event.waitUntil(
      Promise.all([caches.open(CHAPTER_CACHE), caches.open(CHAPTER_META_CACHE)]).then(
        ([chapterCache, chapterMetaCache]) =>
          maybePruneChapterCache(chapterCache, chapterMetaCache)
      )
    )
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

function withChapterCacheHeaders(response) {
  const headers = new Headers(response.headers)
  headers.set('X-Reader-Chapter-Cached-At', `${Date.now()}`)
  headers.set('X-Reader-Chapter-TTL', `${CHAPTER_CACHE_TTL_MS}`)
  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function getChapterCacheMetaRequest(url) {
  return new Request(
    `${self.location.origin}/__chapter_cache_meta__?url=${encodeURIComponent(url)}`
  )
}

async function readChapterCacheMetadata(metaCache, url) {
  const metaResponse = await metaCache.match(getChapterCacheMetaRequest(url))
  if (!metaResponse) {
    return null
  }

  try {
    return await metaResponse.json()
  } catch {
    return null
  }
}

async function writeChapterCacheMetadata(metaCache, url) {
  const now = Date.now()
  const metadata = {
    url,
    lastAccessAt: now,
    expiresAt: now + CHAPTER_CACHE_TTL_MS,
  }
  await metaCache.put(
    getChapterCacheMetaRequest(url),
    new Response(JSON.stringify(metadata), {
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

async function deleteChapterCacheEntry(chapterCache, metaCache, requestOrUrl) {
  const request =
    typeof requestOrUrl === 'string' ? new Request(requestOrUrl) : requestOrUrl
  await Promise.all([
    chapterCache.delete(request),
    metaCache.delete(getChapterCacheMetaRequest(request.url)),
  ])
}

async function maybePruneChapterCache(chapterCache, metaCache) {
  const now = Date.now()
  if (now - lastChapterCachePruneAt < CHAPTER_CACHE_PRUNE_INTERVAL_MS) {
    return
  }
  lastChapterCachePruneAt = now

  const chapterRequests = await chapterCache.keys()
  if (chapterRequests.length === 0) {
    return
  }

  const entries = await Promise.all(
    chapterRequests.map(async request => ({
      request,
      metadata: await readChapterCacheMetadata(metaCache, request.url),
    }))
  )

  await Promise.all(
    entries
      .filter(entry => !entry.metadata || entry.metadata.expiresAt <= now)
      .map(entry => deleteChapterCacheEntry(chapterCache, metaCache, entry.request))
  )

  const remaining = (
    await Promise.all(
      (await chapterCache.keys()).map(async request => ({
        request,
        metadata: await readChapterCacheMetadata(metaCache, request.url),
      }))
    )
  ).sort(
    (a, b) =>
      (b.metadata?.lastAccessAt || 0) - (a.metadata?.lastAccessAt || 0)
  )

  if (remaining.length <= CHAPTER_CACHE_MAX_ENTRIES) {
    return
  }

  const toDelete = remaining.slice(CHAPTER_CACHE_MAX_ENTRIES)
  await Promise.all(
    toDelete.map(entry => deleteChapterCacheEntry(chapterCache, metaCache, entry.request))
  )
}

async function chapterCacheFirstWithRefresh(request) {
  const [chapterCache, chapterMetaCache] = await Promise.all([
    caches.open(CHAPTER_CACHE),
    caches.open(CHAPTER_META_CACHE),
  ])
  const cached = await chapterCache.match(request)
  if (cached) {
    const metadata = await readChapterCacheMetadata(chapterMetaCache, request.url)
    if (metadata && metadata.expiresAt <= Date.now()) {
      await deleteChapterCacheEntry(chapterCache, chapterMetaCache, request)
    } else {
      await writeChapterCacheMetadata(chapterMetaCache, request.url)
      void fetch(request)
        .then(response => {
          if (response.ok) {
            return Promise.all([
              chapterCache.put(request, withChapterCacheHeaders(response)),
              writeChapterCacheMetadata(chapterMetaCache, request.url),
              maybePruneChapterCache(chapterCache, chapterMetaCache),
            ])
          }
          return undefined
        })
        .catch(() => {})

      return cached
    }
  }

  const response = await fetch(request)
  if (response.ok) {
    await Promise.all([
      chapterCache.put(request, withChapterCacheHeaders(response)),
      writeChapterCacheMetadata(chapterMetaCache, request.url),
      maybePruneChapterCache(chapterCache, chapterMetaCache),
    ])
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
