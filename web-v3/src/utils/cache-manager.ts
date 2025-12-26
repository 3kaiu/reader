/**
 * 缓存管理工具
 * 用于管理 Service Worker 缓存和 IndexedDB 缓存
 */

/**
 * 清理 Service Worker 缓存
 */
export async function clearServiceWorkerCache(): Promise<void> {
  if ('caches' in window) {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((name) => caches.delete(name)))
  }
}

/**
 * 清理章节缓存
 */
export async function clearChapterCache(): Promise<void> {
  if ('caches' in window) {
    const chapterCacheName = 'reader-chapters-v1' // 应该从常量导入
    await caches.delete(chapterCacheName)
  }
}

/**
 * 获取缓存大小（估算）
 */
export async function getCacheSize(): Promise<number> {
  if (!('caches' in window)) return 0
  
  let totalSize = 0
  const cacheNames = await caches.keys()
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName)
    const keys = await cache.keys()
    
    // 估算：每个缓存项平均 100KB（章节内容通常较大）
    totalSize += keys.length * 100 * 1024
  }
  
  return totalSize
}

/**
 * 格式化缓存大小
 */
export function formatCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
