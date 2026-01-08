/**
 * 搜索缓存管理器
 * 使用 IndexedDB 缓存术语搜索结果
 * - 普通结果: 7天过期
 * - 热门词 (命中10次以上): 永久保留
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { TermSearchResult } from '@/api/search'

const DB_NAME = 'nexus-search-cache'
const DB_VERSION = 1
const STORE_NAME = 'terms'

// 缓存配置
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000  // 7天
const HOT_THRESHOLD = 10  // 热门词阈值

interface CachedTerm {
  term: string
  result: TermSearchResult
  timestamp: number
  hitCount: number
  isHot: boolean
}

let dbInstance: IDBPDatabase | null = null

/**
 * 获取数据库实例
 */
async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'term' })
        store.createIndex('timestamp', 'timestamp')
        store.createIndex('hitCount', 'hitCount')
        store.createIndex('isHot', 'isHot')
      }
    }
  })

  return dbInstance
}

/**
 * 从缓存获取术语
 */
export async function getCached(term: string): Promise<TermSearchResult | null> {
  try {
    const db = await getDB()
    const cached = await db.get(STORE_NAME, term) as CachedTerm | undefined

    if (!cached) return null

    const now = Date.now()
    const isExpired = !cached.isHot && (now - cached.timestamp > CACHE_TTL)

    if (isExpired) {
      // 已过期，删除
      await db.delete(STORE_NAME, term)
      return null
    }

    // 更新命中次数
    cached.hitCount++
    if (cached.hitCount >= HOT_THRESHOLD && !cached.isHot) {
      cached.isHot = true
    }
    await db.put(STORE_NAME, cached)

    return cached.result
  } catch (e) {
    console.warn('[SearchCache] getCached error:', e)
    return null
  }
}

/**
 * 缓存术语搜索结果
 */
export async function setCache(term: string, result: TermSearchResult): Promise<void> {
  try {
    const db = await getDB()
    const existing = await db.get(STORE_NAME, term) as CachedTerm | undefined

    const entry: CachedTerm = {
      term,
      result,
      timestamp: Date.now(),
      hitCount: existing ? existing.hitCount + 1 : 1,
      isHot: existing?.isHot || false
    }

    if (entry.hitCount >= HOT_THRESHOLD) {
      entry.isHot = true
    }

    await db.put(STORE_NAME, entry)
  } catch (e) {
    console.warn('[SearchCache] setCache error:', e)
  }
}

/**
 * 批量获取缓存
 */
export async function getCachedBatch(terms: string[]): Promise<Map<string, TermSearchResult>> {
  const results = new Map<string, TermSearchResult>()

  try {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const now = Date.now()

    for (const term of terms) {
      const cached = await store.get(term) as CachedTerm | undefined

      if (cached) {
        const isExpired = !cached.isHot && (now - cached.timestamp > CACHE_TTL)

        if (!isExpired) {
          results.set(term, cached.result)
          // 更新命中
          cached.hitCount++
          if (cached.hitCount >= HOT_THRESHOLD) cached.isHot = true
          await store.put(cached)
        } else {
          await store.delete(term)
        }
      }
    }

    await tx.done
  } catch (e) {
    console.warn('[SearchCache] getCachedBatch error:', e)
  }

  return results
}

/**
 * 批量设置缓存
 */
export async function setCacheBatch(results: TermSearchResult[]): Promise<void> {
  try {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    for (const result of results) {
      const existing = await store.get(result.term) as CachedTerm | undefined

      const entry: CachedTerm = {
        term: result.term,
        result,
        timestamp: Date.now(),
        hitCount: existing ? existing.hitCount + 1 : 1,
        isHot: existing?.isHot || false
      }

      if (entry.hitCount >= HOT_THRESHOLD) entry.isHot = true
      await store.put(entry)
    }

    await tx.done
  } catch (e) {
    console.warn('[SearchCache] setCacheBatch error:', e)
  }
}

/**
 * 清理过期缓存
 */
export async function cleanExpired(): Promise<number> {
  let cleaned = 0

  try {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const now = Date.now()

    let cursor = await store.openCursor()
    while (cursor) {
      const entry = cursor.value as CachedTerm
      const isExpired = !entry.isHot && (now - entry.timestamp > CACHE_TTL)

      if (isExpired) {
        await cursor.delete()
        cleaned++
      }

      cursor = await cursor.continue()
    }

    await tx.done
  } catch (e) {
    console.warn('[SearchCache] cleanExpired error:', e)
  }

  return cleaned
}

/**
 * 获取缓存统计
 */
export async function getCacheStats(): Promise<{
  total: number
  hot: number
  sizeEstimate: number
}> {
  try {
    const db = await getDB()
    const all = await db.getAll(STORE_NAME) as CachedTerm[]

    return {
      total: all.length,
      hot: all.filter(e => e.isHot).length,
      sizeEstimate: JSON.stringify(all).length
    }
  } catch (e) {
    return { total: 0, hot: 0, sizeEstimate: 0 }
  }
}

/**
 * 清空所有缓存
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await getDB()
    await db.clear(STORE_NAME)
  } catch (e) {
    console.warn('[SearchCache] clearCache error:', e)
  }
}
