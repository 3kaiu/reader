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
     * 检查存储配额
     */
    async function checkQuota(): Promise<{ used: number; quota: number; usagePercent: number; isCritical: boolean }> {
        if (!navigator.storage || !navigator.storage.estimate) {
            return { used: 0, quota: 0, usagePercent: 0, isCritical: false }
        }
        try {
            const { usage, quota } = await navigator.storage.estimate()
            const used = usage || 0
            const total = quota || 0
            const usagePercent = total > 0 ? (used / total) * 100 : 0
            const isCritical = usagePercent > 90 // 超过90%视为严重
            return { used, quota: total, usagePercent, isCritical }
        } catch (e) {
            console.warn('无法获取存储配额', e)
            return { used: 0, quota: 0, usagePercent: 0, isCritical: false }
        }
    }

    /**
     * 缓存单章 (自动压缩)
     */
    async function cacheChapter(chapter: CachedChapter) {
        // 检查配额
        const quota = await checkQuota()
        if (quota.isCritical) {
            console.warn(`存储空间不足 (${quota.usagePercent.toFixed(1)}%)，跳过缓存: ${chapter.title}`)
            // 抛出特定错误供上层处理 (如停止批量下载)
            throw new Error('STORAGE_QUOTA_EXCEEDED')
        }

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
    }

    /**
     * 获取缓存的章节内容（自动解压）
     */
    async function getCachedChapter(bookUrl: string, chapterIndex: number): Promise<CachedChapter | null> {
        const database = await initDB()
        const id = `${bookUrl}:${chapterIndex}`

        return new Promise((resolve) => {
            const tx = database.transaction(STORE_NAME, 'readonly')
            const request = tx.objectStore(STORE_NAME).get(id)

            request.onsuccess = async () => {
                const data = request.result
                if (!data) {
                    resolve(null)
                    return
                }

                try {
                    // 如果内容被压缩，进行解压
                    if (data.compressed && data.content instanceof Uint8Array) {
                        data.content = await decompressText(data.content)
                    }
                    resolve(data as CachedChapter)
                } catch (e) {
                    console.warn('解压章节内容失败', e)
                    resolve(null)
                }
            }

            request.onerror = () => resolve(null)
        })
    }

    /**
     * 清除单个缓存章节
     */
    async function clearCachedChapter(bookUrl: string, chapterIndex: number): Promise<void> {
        const database = await initDB()
        const id = `${bookUrl}:${chapterIndex}`

        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite')
            const request = tx.objectStore(STORE_NAME).delete(id)

            request.onsuccess = () => {
                // 更新内存索引
                cachedBooks.value.get(bookUrl)?.delete(chapterIndex)
                if (cachedBooks.value.get(bookUrl)?.size === 0) {
                    cachedBooks.value.delete(bookUrl)
                }
                resolve()
            }

            request.onerror = () => reject(request.error)
        })
    }

    // 下载取消控制器
    let downloadAbortController: AbortController | null = null

    /**
     * 批量下载书籍章节 (并行流水线优化)
     */
    async function downloadBook(
        bookUrl: string,
        bookName: string,
        sourceId: string,
        chapters: { index: number; title: string; url: string }[],
        fetchContent: (chapterUrl: string) => Promise<string>
    ): Promise<{ success: number; failed: number }> {
        if (isDownloading.value) {
            throw new Error('已有下载任务进行中')
        }

        isDownloading.value = true
        downloadAbortController = new AbortController()
        downloadProgress.value = { current: 0, total: chapters.length, bookName }

        let success = 0
        let failed = 0

        const CONCURRENCY = 3 // 并发下载窗口大小
        const queue = [...chapters]

        const runWorker = async () => {
            while (queue.length > 0 && !downloadAbortController?.signal.aborted) {
                const chapter = queue.shift()!

                if (isChapterCached(bookUrl, chapter.index)) {
                    success++
                    downloadProgress.value.current++
                    continue
                }

                try {
                    const content = await fetchContent(chapter.url)
                    await cacheChapter({
                        id: `${bookUrl}:${chapter.index}`,
                        bookUrl,
                        sourceId,
                        chapterIndex: chapter.index,
                        title: chapter.title,
                        content,
                        cachedAt: Date.now(),
                    })
                    success++
                } catch (e) {
                    if ((e as Error).message === 'STORAGE_QUOTA_EXCEEDED') {
                        downloadAbortController?.abort()
                        break
                    }
                    failed++
                    console.warn(`下载章节失败: ${chapter.title}`, e)
                }

                downloadProgress.value.current++
                // 给 I/O 留一点微小的喘息时间
                await new Promise(r => setTimeout(r, 50))
            }
        }

        try {
            // 启动多个并行工作者
            const workers = Array.from({ length: CONCURRENCY }, () => runWorker())
            await Promise.all(workers)
        } finally {
            isDownloading.value = false
            downloadAbortController = null
        }

        return { success, failed }
    }

    /**
     * 停止下载
     */
    function stopDownload(): void {
        if (downloadAbortController) {
            downloadAbortController.abort()
        }
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
    function getBookCacheStatus(bookUrl: string): {
        isCached: boolean;
        cachedCount: number;
        cachedChapters: number[]
    } {
        const cached = cachedBooks.value.get(bookUrl)
        if (!cached || cached.size === 0) {
            return { isCached: false, cachedCount: 0, cachedChapters: [] }
        }
        return {
            isCached: true,
            cachedCount: cached.size,
            cachedChapters: Array.from(cached).sort((a, b) => a - b)
        }
    }

    /**
     * 删除书籍的所有缓存
     */
    async function deleteBookCache(bookUrl: string): Promise<void> {
        const database = await initDB()

        return new Promise((resolve, reject) => {
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
                    // 删除完成，更新内存索引
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
    async function clearAllCache(): Promise<void> {
        const database = await initDB()

        return new Promise((resolve, reject) => {
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
    async function getCacheStats(): Promise<{
        totalBooks: number;
        totalChapters: number;
        estimatedSize: string;
        quota: { used: number; total: number; percent: number };
    }> {
        const database = await initDB()
        const quotaInfo = await checkQuota()

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

                resolve({
                    totalBooks,
                    totalChapters,
                    estimatedSize,
                    quota: {
                        used: quotaInfo.used,
                        total: quotaInfo.quota,
                        percent: quotaInfo.usagePercent
                    }
                })
            }

            countRequest.onerror = () => resolve({
                totalBooks: 0,
                totalChapters: 0,
                estimatedSize: '0 KB',
                quota: { used: 0, total: 0, percent: 0 }
            })
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
