// Nexus Reader Service Worker
// 提供离线功能、缓存管理和后台同步

const CACHE_VERSION = 'nexus-reader-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const NOVELS_CACHE = `${CACHE_VERSION}-novels`;
const IMAGES_CACHE = `${CACHE_VERSION}-images`;

// 需要预缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/static/css/main.css',
  '/static/js/main.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// 需要缓存的API端点
const CACHEABLE_APIS = [
  '/api/novels',
  '/api/user/preferences',
  '/api/reading/progress'
];

// 缓存策略配置
const CACHE_STRATEGIES = {
  // 静态资源：缓存优先
  static: {
    cacheName: STATIC_CACHE,
    strategy: 'cache-first',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30天
    maxEntries: 100
  },
  
  // 动态内容：网络优先，缓存回退
  dynamic: {
    cacheName: DYNAMIC_CACHE,
    strategy: 'network-first',
    maxAge: 24 * 60 * 60 * 1000, // 1天
    maxEntries: 50
  },
  
  // 小说内容：缓存优先，定期更新
  novels: {
    cacheName: NOVELS_CACHE,
    strategy: 'cache-first',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
    maxEntries: 1000
  },
  
  // 图片：缓存优先，长期存储
  images: {
    cacheName: IMAGES_CACHE,
    strategy: 'cache-first',
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90天
    maxEntries: 500
  }
};

// Service Worker安装事件
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    (async () => {
      try {
        // 预缓存静态资源
        const staticCache = await caches.open(STATIC_CACHE);
        await staticCache.addAll(STATIC_ASSETS);
        
        console.log('Service Worker: Static assets cached');
        
        // 跳过等待，立即激活
        await self.skipWaiting();
        
        // 通知客户端离线准备就绪
        broadcastMessage('OFFLINE_READY', { timestamp: Date.now() });
        
      } catch (error) {
        console.error('Service Worker: Installation failed', error);
        throw error;
      }
    })()
  );
});

// Service Worker激活事件
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    (async () => {
      try {
        // 清理旧缓存
        await cleanupOldCaches();
        
        // 立即控制所有客户端
        await self.clients.claim();
        
        console.log('Service Worker: Activated and controlling clients');
        
      } catch (error) {
        console.error('Service Worker: Activation failed', error);
      }
    })()
  );
});

// 网络请求拦截
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 只处理同源请求
  if (url.origin !== location.origin) {
    return;
  }
  
  event.respondWith(handleRequest(request));
});

// 后台同步事件
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered', event.tag);
  
  if (event.tag === 'reading-progress-sync') {
    event.waitUntil(syncReadingProgress());
  } else if (event.tag === 'novel-content-sync') {
    event.waitUntil(syncNovelContent());
  } else if (event.tag === 'user-preferences-sync') {
    event.waitUntil(syncUserPreferences());
  }
});

// 推送通知事件（预留）
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received', event);
  
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(showNotification(data));
  }
});

// 通知点击事件
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event);
  
  event.notification.close();
  
  event.waitUntil(
    self.clients.openWindow(event.notification.data?.url || '/')
  );
});

// 消息处理
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_NOVEL':
      event.waitUntil(cacheNovel(payload));
      break;
      
    case 'REMOVE_NOVEL_CACHE':
      event.waitUntil(removeNovelCache(payload));
      break;
      
    case 'CLEAR_ALL_CACHE':
      event.waitUntil(clearAllCaches());
      break;
      
    case 'GET_CACHE_SIZE':
      event.waitUntil(getCacheSize().then(size => {
        event.ports[0].postMessage({ type: 'CACHE_SIZE', payload: size });
      }));
      break;
      
    default:
      console.log('Service Worker: Unknown message type', type);
  }
});

// 请求处理函数
async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  try {
    // 根据请求类型选择缓存策略
    if (isStaticAsset(pathname)) {
      return await cacheFirstStrategy(request, CACHE_STRATEGIES.static);
    } else if (isImageRequest(pathname)) {
      return await cacheFirstStrategy(request, CACHE_STRATEGIES.images);
    } else if (isNovelContent(pathname)) {
      return await cacheFirstStrategy(request, CACHE_STRATEGIES.novels);
    } else if (isAPIRequest(pathname)) {
      return await networkFirstStrategy(request, CACHE_STRATEGIES.dynamic);
    } else {
      return await networkFirstStrategy(request, CACHE_STRATEGIES.dynamic);
    }
  } catch (error) {
    console.error('Service Worker: Request handling failed', error);
    return await handleOfflineFallback(request);
  }
}

// 缓存优先策略
async function cacheFirstStrategy(request, config) {
  const cache = await caches.open(config.cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // 检查缓存是否过期
    const cacheTime = new Date(cachedResponse.headers.get('sw-cache-time') || 0);
    const isExpired = Date.now() - cacheTime.getTime() > config.maxAge;
    
    if (!isExpired) {
      return cachedResponse;
    }
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // 克隆响应用于缓存
      const responseToCache = networkResponse.clone();
      
      // 添加缓存时间戳
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-time', new Date().toISOString());
      
      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });
      
      await cache.put(request, modifiedResponse);
      await limitCacheSize(config.cacheName, config.maxEntries);
    }
    
    return networkResponse;
  } catch (error) {
    // 网络失败，返回缓存的响应（即使过期）
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// 网络优先策略
async function networkFirstStrategy(request, config) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(config.cacheName);
      const responseToCache = networkResponse.clone();
      
      // 添加缓存时间戳
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-time', new Date().toISOString());
      
      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });
      
      await cache.put(request, modifiedResponse);
      await limitCacheSize(config.cacheName, config.maxEntries);
    }
    
    return networkResponse;
  } catch (error) {
    // 网络失败，尝试从缓存获取
    const cache = await caches.open(config.cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// 离线回退处理
async function handleOfflineFallback(request) {
  const url = new URL(request.url);
  
  // 对于导航请求，返回离线页面
  if (request.mode === 'navigate') {
    const cache = await caches.open(STATIC_CACHE);
    return await cache.match('/offline.html') || new Response('Offline', { status: 503 });
  }
  
  // 对于图片请求，返回占位符
  if (request.destination === 'image') {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#f0f0f0"/><text x="100" y="100" text-anchor="middle" dy=".3em" fill="#999">离线</text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
  
  return new Response('Service Unavailable', { status: 503 });
}

// 请求类型判断函数
function isStaticAsset(pathname) {
  return pathname.startsWith('/static/') || 
         pathname === '/manifest.json' || 
         pathname.endsWith('.css') || 
         pathname.endsWith('.js');
}

function isImageRequest(pathname) {
  return pathname.startsWith('/images/') || 
         pathname.startsWith('/icons/') ||
         /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(pathname);
}

function isNovelContent(pathname) {
  return pathname.startsWith('/api/novels/') && 
         (pathname.includes('/content') || pathname.includes('/chapters'));
}

function isAPIRequest(pathname) {
  return pathname.startsWith('/api/');
}

// 缓存管理函数
async function limitCacheSize(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxEntries) {
    // 删除最旧的条目
    const entriesToDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(entriesToDelete.map(key => cache.delete(key)));
  }
}

async function cleanupOldCaches() {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(name => 
    name.startsWith('nexus-reader-') && !name.includes(CACHE_VERSION)
  );
  
  await Promise.all(oldCaches.map(name => caches.delete(name)));
  console.log('Service Worker: Old caches cleaned up', oldCaches);
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('Service Worker: All caches cleared');
}

async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    
    for (const key of keys) {
      const response = await cache.match(key);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
  }
  
  return totalSize;
}

// 小说缓存管理
async function cacheNovel(novelData) {
  try {
    const cache = await caches.open(NOVELS_CACHE);
    
    // 缓存小说元数据
    const metadataRequest = new Request(`/api/novels/${novelData.id}`);
    const metadataResponse = new Response(JSON.stringify(novelData), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(metadataRequest, metadataResponse);
    
    // 缓存小说章节
    if (novelData.chapters) {
      for (const chapter of novelData.chapters) {
        const chapterRequest = new Request(`/api/novels/${novelData.id}/chapters/${chapter.id}`);
        const chapterResponse = new Response(JSON.stringify(chapter), {
          headers: { 'Content-Type': 'application/json' }
        });
        await cache.put(chapterRequest, chapterResponse);
      }
    }
    
    broadcastMessage('NOVEL_CACHED', { novelId: novelData.id });
    console.log('Service Worker: Novel cached', novelData.id);
    
  } catch (error) {
    console.error('Service Worker: Failed to cache novel', error);
    broadcastMessage('CACHE_ERROR', { error: error.message });
  }
}

async function removeNovelCache(novelId) {
  try {
    const cache = await caches.open(NOVELS_CACHE);
    const keys = await cache.keys();
    
    const novelKeys = keys.filter(key => 
      key.url.includes(`/novels/${novelId}`)
    );
    
    await Promise.all(novelKeys.map(key => cache.delete(key)));
    
    broadcastMessage('NOVEL_CACHE_REMOVED', { novelId });
    console.log('Service Worker: Novel cache removed', novelId);
    
  } catch (error) {
    console.error('Service Worker: Failed to remove novel cache', error);
  }
}

// 后台同步函数
async function syncReadingProgress() {
  try {
    // 从IndexedDB获取待同步的阅读进度
    const db = await openDB();
    const transaction = db.transaction(['syncQueue'], 'readonly');
    const store = transaction.objectStore('syncQueue');
    const progressItems = await getAll(store);
    
    for (const item of progressItems) {
      if (item.type === 'reading-progress') {
        await fetch('/api/sync/reading-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data)
        });
        
        // 同步成功后从队列中移除
        await removeFromSyncQueue(item.id);
      }
    }
    
    console.log('Service Worker: Reading progress synced');
    
  } catch (error) {
    console.error('Service Worker: Reading progress sync failed', error);
  }
}

async function syncNovelContent() {
  // 实现小说内容同步逻辑
  console.log('Service Worker: Novel content sync triggered');
}

async function syncUserPreferences() {
  // 实现用户偏好同步逻辑
  console.log('Service Worker: User preferences sync triggered');
}

// 通知函数
async function showNotification(data) {
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: data.data,
    actions: data.actions || []
  };
  
  await self.registration.showNotification(data.title, options);
}

// 消息广播
function broadcastMessage(type, payload) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type, payload });
    });
  });
}

// IndexedDB辅助函数
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NexusReaderDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeFromSyncQueue(id) {
  const db = await openDB();
  const transaction = db.transaction(['syncQueue'], 'readwrite');
  const store = transaction.objectStore('syncQueue');
  await store.delete(id);
}

console.log('Service Worker: Loaded and ready');