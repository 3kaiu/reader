/**
 * 离线存储 Store
 * 管理章节缓存、下载状态，支持离线阅读
 * 
 * [Optimization v4.0]
 * - 使用 Compression Streams API (Gzip) 压缩内容，减少 60%+ 存储占用
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

const DB_NAME = 'reader-offline'
const STORE_NAME = 'chapters'
const DB_VERSION = 1

export interface CachedChapter {
    id: string // `${bookUrl}:${chapterIndex}`
    bookUrl: string
    sourceId: string
    chapterIndex: number
    title: string
    content: string
    cachedAt: number
    compressed?: boolean
}

/**
 * 使用 Compression Streams 压缩文本
 */
async function compressText(text: string): Promise<Uint8Array> {
    const stream = new Blob([text]).stream()
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'))
    const reader = compressedStream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
    }
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
    }
    return result
}

/**
 * 使用 Decompression Streams 解压文本
 */
async function decompressText(data: Uint8Array): Promise<string> {
    const stream = new Blob([data]).stream()
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'))
    const response = new Response(decompressedStream)
    return await response.text()
}

export const useOfflineStore = defineStore('offline', () => {
    // 内存索引：bookUrl -> 已缓存章节号集合
    const cachedBooks = ref<Map<string, Set<number>>>(new Map())
    const isDownloading = ref(false)
    const downloadProgress = ref({ current: 0, total: 0, bookName: '' })
    const isInitialized = ref(false)

    let db: IDBDatabase | null = null

    /**
     * 初始化 IndexedDB
     */
    async function initDB(): Promise<IDBDatabase> {
        if (db) return db

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)

            request.onupgradeneeded = () => {
                const database = request.result
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
                    store.createIndex('bookUrl', 'bookUrl', { unique: false })
                    store.createIndex('cachedAt', 'cachedAt', { unique: false })
                }
            }

            request.onsuccess = () => {
                db = request.result
                resolve(db)
            }

            request.onerror = () => reject(request.error)
        })
    }

    /**
     * 初始化内存索引（从 IndexedDB 重建）
     */
    async function loadCacheIndex() {
        if (isInitialized.value) return

        try {
            const database = await initDB()
            const tx = database.transaction(STORE_NAME, 'readonly')
            const store = tx.objectStore(STORE_NAME)
            const request = store.openCursor()

            cachedBooks.value.clear()

            request.onsuccess = () => {
                const cursor = request.result
                if (cursor) {
                    const chapter = cursor.value as CachedChapter
                    if (!cachedBooks.value.has(chapter.bookUrl)) {
                        cachedBooks.value.set(chapter.bookUrl, new Set())
                    }
                    cachedBooks.value.get(chapter.bookUrl)?.add(chapter.chapterIndex)
                    cursor.continue()
                } else {
                    isInitialized.value = true
                }
            }
        } catch (e) {
            console.warn('加载离线缓存索引失败', e)
        }
    }

    /**
     * 缓存单章 (自动压缩)
     */
    async function cacheChapter(chapter: CachedChapter) {
        const database = await initDB()

        // 压缩内容以降低存储占用
        let finalData: any = { ...chapter }
        try {
            const compressedContent = await compressText(chapter.content)
            finalData.content = compressedContent
            finalData.compressed = true
        } catch (e) {
            console.warn('压缩章节内容失败，降级为原始存储', e)
        }

        return new Promise<void>((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite')
            const request = tx.objectStore(STORE_NAME).put(finalData)

            request.onsuccess = () => {
                // 更新内存索引
                if (!cachedBooks.value.has(chapter.bookUrl)) {
                    cachedBooks.value.set(chapter.bookUrl, new Set())
                }
                cachedBooks.value.get(chapter.bookUrl)?.add(chapter.chapterIndex)
                resolve()
            }

            request.onerror = () => reject(request.error)
        })
        /**
         * 清除单章缓存
         */
    }

    async function clearCachedChapter(bookUrl: string, chapterIndex: number) {
        const database = await initDB()
        return new Promise<void>((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite')
            const request = tx.objectStore(STORE_NAME).delete(`${bookUrl}:${chapterIndex}`)
            request.onsuccess = () => {
                cachedBooks.value.get(bookUrl)?.delete(chapterIndex)
                resolve()
            }
            request.onerror = () => reject(request.error)
        })
    }

    /**
     * 获取缓存章节 (自动解压)
     */
    async function getCachedChapter(bookUrl: string, chapterIndex: number): Promise<CachedChapter | null> {
        const database = await initDB()

        return new Promise((resolve) => {
            const tx = database.transaction(STORE_NAME, 'readonly')
            const request = tx.objectStore(STORE_NAME).get(`${bookUrl}:${chapterIndex}`)

            request.onsuccess = async () => {
                const result = request.result
                if (!result) return resolve(null)

                // 检查是否压缩过
                if (result.compressed && result.content instanceof Uint8Array) {
                    try {
                        result.content = await decompressText(result.content)
                    } catch (e) {
                        console.error('解压缩章节失败', e)
                        return resolve(null)
                    }
                }
                resolve(result)
            }
            request.onerror = () => resolve(null)
        })
    }

    /**
     * 批量下载书籍章节
     */
    async function downloadBook(
        bookUrl: string,
        sourceId: string,
        bookName: string,
        chapters: { index: number; title: string; url: string }[],
        fetchChapter: (url: string) => Promise<string>,
        options?: { concurrency?: number; onProgress?: (current: number, total: number) => void }
    ) {
        const { concurrency = 3, onProgress } = options || {}

        isDownloading.value = true
        downloadProgress.value = { current: 0, total: chapters.length, bookName }

        // 过滤已缓存的章节
        const uncached = chapters.filter(ch => !isChapterCached(bookUrl, ch.index))
        downloadProgress.value.total = uncached.length

        // 并发下载
        const queue = [...uncached]
        const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(async () => {
            while (queue.length > 0) {
                const chapter = queue.shift()
                if (!chapter) break

                if (!isDownloading.value) break // 支持停止下载

                try {
                    const content = await fetchChapter(chapter.url)
                    await cacheChapter({
                        id: `${bookUrl}:${chapter.index}`,
                        bookUrl,
                        sourceId,
                        chapterIndex: chapter.index,
                        title: chapter.title,
                        content,
                        cachedAt: Date.now(),
                    })
                    downloadProgress.value.current++
                    onProgress?.(downloadProgress.value.current, downloadProgress.value.total)
                } catch (e) {
                    console.warn(`下载章节失败: ${chapter.title}`, e)
                }
            }
        })

        await Promise.all(workers)
        isDownloading.value = false
    }

    /**
     * 停止下载
     */
    function stopDownload() {
        isDownloading.value = false
    }

    /**
     * 检查章节是否已缓存
     */
    function isChapterCached(bookUrl: string, chapterIndex: number): boolean {
        return cachedBooks.value.get(bookUrl)?.has(chapterIndex) ?? false
    }

    /**
     * 获取书籍缓存状态
     */
    function getBookCacheStatus(bookUrl: string, totalChapters: number) {
        const cached = cachedBooks.value.get(bookUrl)?.size ?? 0
        return {
            cached,
            total: totalChapters,
            percentage: totalChapters > 0 ? Math.round((cached / totalChapters) * 100) : 0,
        }
    }

    /**
     * 删除书籍的所有缓存
     */
    async function deleteBookCache(bookUrl: string) {
        const database = await initDB()

        return new Promise<void>((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite')
            const store = tx.objectStore(STORE_NAME)
            const index = store.index('bookUrl')
            const request = index.openCursor(IDBKeyRange.only(bookUrl))

            request.onsuccess = () => {
                const cursor = request.result
                if (cursor) {
                    cursor.delete()
                    cursor.continue()
                } else {
                    cachedBooks.value.delete(bookUrl)
                    resolve()
                }
            }

            request.onerror = () => reject(request.error)
        })
    }

    /**
     * 清空所有缓存
     */
    async function clearAllCache() {
        const database = await initDB()

        return new Promise<void>((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite')
            const request = tx.objectStore(STORE_NAME).clear()

            request.onsuccess = () => {
                cachedBooks.value.clear()
                resolve()
            }

            request.onerror = () => reject(request.error)
        })
    }

    /**
     * 获取缓存大小统计
     */
    async function getCacheStats(): Promise<{ totalBooks: number; totalChapters: number; estimatedSize: string }> {
        const database = await initDB()

        return new Promise((resolve) => {
            const tx = database.transaction(STORE_NAME, 'readonly')
            const store = tx.objectStore(STORE_NAME)
            const countRequest = store.count()

            countRequest.onsuccess = () => {
                const totalChapters = countRequest.result
                const totalBooks = cachedBooks.value.size
                // 压缩后大小估算：每章约 3KB (压缩前 10KB)
                const estimatedBytes = totalChapters * 3 * 1024
                const estimatedSize = estimatedBytes > 1024 * 1024
                    ? `${(estimatedBytes / 1024 / 1024).toFixed(1)} MB`
                    : `${(estimatedBytes / 1024).toFixed(0)} KB`

                resolve({ totalBooks, totalChapters, estimatedSize })
            }

            countRequest.onerror = () => resolve({ totalBooks: 0, totalChapters: 0, estimatedSize: '0 KB' })
        })
    }

    return {
        cachedBooks,
        isDownloading,
        downloadProgress,
        isInitialized,
        initDB,
        loadCacheIndex,
        cacheChapter,
        getCachedChapter,
        clearCachedChapter,
        downloadBook,
        stopDownload,
        isChapterCached,
        getBookCacheStatus,
        deleteBookCache,
        clearAllCache,
        getCacheStats,
    }
})
