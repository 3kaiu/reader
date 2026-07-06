import { readerApi } from '@/api/reader'
import type { Chapter } from '@/types/book'
import type { ReaderBook } from '@/utils/readerStore'

export interface PrefetchDeps {
  getCachedChapterContent: (chapterUrl: string) => string | undefined
  cacheChapterContent: (chapterUrl: string, content: string) => void
  inflightFetch: (chapter: Chapter, book: ReaderBook) => Promise<string>
  inflightCancel: (chapter: Chapter, book: ReaderBook) => void
}

export function createReaderPrefetchService(deps: PrefetchDeps) {
  let prefetchIdleTaskId: number | ReturnType<typeof setTimeout> | null = null
  let prefetchAbortController: AbortController | null = null
  let prefetchTaskAbortController: AbortController | null = null
  const PREFETCH_IDLE_TIMEOUT_MS = 1200
  const PREFETCH_BATCH_MAX = 4

  const scheduleBackgroundTask = (
    callback: () => void,
    timeoutMs: number
  ): number | ReturnType<typeof setTimeout> => {
    const scheduler = (
      globalThis as {
        scheduler?: {
          postTask?: (
            callback: () => void,
            options: {
              priority: 'background'
              signal: AbortSignal
            }
          ) => Promise<unknown>
        }
      }
    ).scheduler
    if (scheduler?.postTask) {
      prefetchTaskAbortController = new AbortController()
      void scheduler
        .postTask(callback, {
          priority: 'background',
          signal: prefetchTaskAbortController.signal,
        })
        .catch(() => undefined)
      return -1
    }

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(() => callback(), { timeout: timeoutMs })
    }

    return globalThis.setTimeout(callback, 120)
  }

  const cancelPendingTasks = () => {
    if (prefetchAbortController) {
      prefetchAbortController.abort()
      prefetchAbortController = null
    }
    if (prefetchTaskAbortController) {
      prefetchTaskAbortController.abort()
      prefetchTaskAbortController = null
    }

    if (prefetchIdleTaskId !== null) {
      if (
        typeof prefetchIdleTaskId === 'number' &&
        prefetchIdleTaskId >= 0 &&
        typeof window !== 'undefined' &&
        typeof window.cancelIdleCallback === 'function'
      ) {
        window.cancelIdleCallback(prefetchIdleTaskId)
      } else if (prefetchIdleTaskId !== -1) {
        clearTimeout(prefetchIdleTaskId)
      }
      prefetchIdleTaskId = null
    }
  }

  const prefetchChapterContent = (chapter: Chapter | undefined, book: ReaderBook, catalog: Chapter[]) => {
    if (!chapter) {
      return
    }

    if (deps.getCachedChapterContent(chapter.url) !== undefined) {
      return
    }

    cancelPendingTasks()

    const abortController = new AbortController()
    prefetchAbortController = abortController

    const executePrefetch = () => {
      prefetchIdleTaskId = null
      if (abortController.signal.aborted) {
        return
      }

      if (!catalog || catalog.length === 0) {
        return
      }

      const startIdx = catalog.findIndex(c => c.url === chapter.url)
      if (startIdx < 0) {
        return
      }

      const slice = catalog.slice(startIdx, startIdx + PREFETCH_BATCH_MAX)
      const toPrefetch: Chapter[] = []
      for (const ch of slice) {
        if (deps.getCachedChapterContent(ch.url) !== undefined) {
          continue
        }
        toPrefetch.push(ch)
      }

      if (toPrefetch.length === 0) {
        return
      }

      if (toPrefetch.length === 1) {
        void deps.inflightFetch(toPrefetch[0], book).catch(() => undefined)
        return
      }

      const urls = toPrefetch.map(ch => ch.url)
      const batchPromise = (async () => {
        const res = await readerApi.batchContent(book.sourceId, urls)
        if (!res.isSuccess) {
          throw new Error(res.errorMsg || '批量预取正文失败')
        }
        const data = res.data
        if (!data?.results) {
          return
        }
        for (const row of data.results) {
          const text = row.content?.trim()
          if (text && row.url) {
            deps.cacheChapterContent(row.url, text)
          }
        }
      })().catch(() => undefined)

      for (const ch of toPrefetch) {
        batchPromise.then(() => {
          const c = deps.getCachedChapterContent(ch.url)
          if (typeof c !== 'string') {
            throw new Error('预取未完成')
          }
          return c
        }).catch(() => undefined)
        deps.inflightCancel(ch, book)
      }

      void batchPromise.finally(() => {
        // no cleanup needed; cache drives the result
      })
    }

    prefetchIdleTaskId = scheduleBackgroundTask(executePrefetch, PREFETCH_IDLE_TIMEOUT_MS)
  }

  return {
    prefetchChapterContent,
    cancelPendingTasks,
  }
}