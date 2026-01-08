/**
 * AI 分析结果缓存
 * 使用 IndexedDB 存储章节摘要、谐音识别结果
 */
import { logger } from '../utils/logger'
import { IDB_DB_NAME, IDB_DB_VERSION, IDB_STORE_NAME } from '../constants/cache'

const DB_NAME = IDB_DB_NAME
const DB_VERSION = IDB_DB_VERSION
const STORE_NAME = IDB_STORE_NAME

interface CacheEntry {
    id: string // bookUrl + chapterIndex + type
    bookUrl: string
    chapterIndex: number
    type: 'summary' | 'homophone'
    result: string | any[]
    createdAt: number
}

let db: IDBDatabase | null = null

// 初始化数据库
function initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db)
            return
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
            db = request.result
            resolve(db)
        }

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
                store.createIndex('bookUrl', 'bookUrl', { unique: false })
                store.createIndex('createdAt', 'createdAt', { unique: false })
            }
        }
    })
}

// 生成缓存 key
function getCacheKey(bookUrl: string, chapterIndex: number, type: string): string {
    return `${bookUrl}:${chapterIndex}:${type}`
}

// 获取缓存
export async function getCache(
    bookUrl: string,
    chapterIndex: number,
    type: 'summary' | 'homophone'
): Promise<CacheEntry | null> {
    try {
        const database = await initDB()
        const transaction = database.transaction(STORE_NAME, 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const key = getCacheKey(bookUrl, chapterIndex, type)

        return new Promise((resolve, reject) => {
            const request = store.get(key)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
                const entry = request.result as CacheEntry | undefined
                if (entry) {
                    // 检查是否过期（7天）
                    const maxAge = 7 * 24 * 60 * 60 * 1000
                    if (Date.now() - entry.createdAt > maxAge) {
                        // 过期，删除并返回 null
                        deleteCache(bookUrl, chapterIndex, type)
                        resolve(null)
                    } else {
                        resolve(entry)
                    }
                } else {
                    resolve(null)
                }
            }
        })
    } catch (e) {
        logger.error('获取缓存失败', e as Error, { function: 'getCache' })
        return null
    }
}

// 设置缓存
export async function setCache(
    bookUrl: string,
    chapterIndex: number,
    type: 'summary' | 'homophone',
    result: string | any[]
): Promise<void> {
    try {
        const database = await initDB()
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)

        const entry: CacheEntry = {
            id: getCacheKey(bookUrl, chapterIndex, type),
            bookUrl,
            chapterIndex,
            type,
            result,
            createdAt: Date.now(),
        }

        store.put(entry)
    } catch (e) {
        logger.error('设置缓存失败', e as Error, { function: 'setCache' })
    }
}

// 删除缓存
export async function deleteCache(
    bookUrl: string,
    chapterIndex: number,
    type: 'summary' | 'homophone'
): Promise<void> {
    try {
        const database = await initDB()
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const key = getCacheKey(bookUrl, chapterIndex, type)

        store.delete(key)
    } catch (e) {
        logger.error('删除缓存失败', e as Error, { function: 'deleteCache' })
    }
}

// 清除某本书的所有缓存
export async function clearBookCache(bookUrl: string): Promise<void> {
    try {
        const database = await initDB()
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const index = store.index('bookUrl')
        const request = index.openCursor(IDBKeyRange.only(bookUrl))

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
            if (cursor) {
                cursor.delete()
                cursor.continue()
            }
        }
    } catch (e) {
        logger.error('清除书籍缓存失败', e as Error, { function: 'clearBookCache' })
    }
}

// 清除所有缓存
export async function clearAllCache(): Promise<void> {
    try {
        const database = await initDB()
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        store.clear()
    } catch (e) {
        logger.error('清除所有缓存失败', e as Error, { function: 'clearAllCache' })
    }
}

// 获取缓存大小（条目数）
export async function getCacheSize(): Promise<number> {
    try {
        const database = await initDB()
        const transaction = database.transaction(STORE_NAME, 'readonly')
        const store = transaction.objectStore(STORE_NAME)

        return new Promise((resolve, reject) => {
            const request = store.count()
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
    } catch (e) {
        logger.error('获取缓存大小失败', e as Error, { function: 'getCacheSize' })
        return 0
    }
}
