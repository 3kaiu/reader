import type { Chapter } from '@/types/book'
import type { ReaderStoreState, ReaderStoreView } from '../types'

type ScrollAnchorSnapshot = {
  chapterIndex: number
  top: number
}

export function createReaderChapterOperations(
  state: ReaderStoreState,
  view: ReaderStoreView,
  helpers: {
    fetchChapterContent: (chapter: Chapter) => Promise<string>
    prefetchChapterContent: (chapter: Chapter | undefined) => void
    setCurrentChapterContent: (chapter: Chapter, chapterContent: string) => void
    updateLoadedChapter: (chapter: Chapter, chapterContent: string, replaceOnly?: boolean) => void
  }
) {
  const captureScrollAnchorSnapshot = (): ScrollAnchorSnapshot | null => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return null
    }

    const markers = Array.from(
      document.querySelectorAll<HTMLElement>('.chapter-marker[data-chapter-index]')
    )
    if (markers.length === 0) {
      return null
    }

    let anchor: HTMLElement | null = null
    const viewportLine = Math.max(window.innerHeight * 0.2, 48)
    let minDistance = Number.POSITIVE_INFINITY

    for (const marker of markers) {
      const rect = marker.getBoundingClientRect()
      const distance = Math.abs(rect.top - viewportLine)
      if (distance < minDistance) {
        minDistance = distance
        anchor = marker
      }
    }

    if (!anchor) {
      return null
    }

    const chapterIndex = Number(anchor.dataset.chapterIndex)
    if (Number.isNaN(chapterIndex)) {
      return null
    }

    return {
      chapterIndex,
      top: anchor.getBoundingClientRect().top,
    }
  }

  const restoreScrollByAnchor = (snapshot: ScrollAnchorSnapshot | null) => {
    if (!snapshot || typeof window === 'undefined' || typeof document === 'undefined') {
      return
    }

    const restoreWithRetry = (retryLeft: number) => {
      window.requestAnimationFrame(() => {
        const marker = document.querySelector<HTMLElement>(
          `.chapter-marker[data-chapter-index="${snapshot.chapterIndex}"]`
        )
        if (!marker) {
          if (retryLeft > 0) {
            restoreWithRetry(retryLeft - 1)
          }
          return
        }

        const nextTop = marker.getBoundingClientRect().top
        const delta = nextTop - snapshot.top
        if (Math.abs(delta) < 0.5) {
          return
        }

        window.scrollBy({
          top: delta,
          behavior: 'auto',
        })
      })
    }

    restoreWithRetry(2)
  }

  const appendNextChapter = async (): Promise<boolean> => {
    if (!view.hasNextChapter.value || !state.catalog.value[state.currentChapterIndex.value + 1]) {
      return false
    }

    state.isLoadingMore.value = true
    state.loadError.value = null
    state.loadErrorDetails.value = null
    const scrollAnchorSnapshot = captureScrollAnchorSnapshot()

    try {
      const next = state.catalog.value[state.currentChapterIndex.value + 1]
      const chapterContent = await helpers.fetchChapterContent(next)
      helpers.updateLoadedChapter(next, chapterContent, false)
      restoreScrollByAnchor(scrollAnchorSnapshot)
      helpers.prefetchChapterContent(state.catalog.value[state.currentChapterIndex.value + 2])
      return true
    } catch (err) {
      state.loadError.value = err instanceof Error ? err.message : '加载下一章失败'
      return false
    } finally {
      state.isLoadingMore.value = false
    }
  }

  const retryLoadNext = async () => {
    state.loadError.value = null
    state.loadErrorDetails.value = null
    return await appendNextChapter()
  }

  const refreshChapter = async (): Promise<number> => {
    if (!state.currentChapter.value) {
      return 0
    }

    const scrollRatio =
      typeof window !== 'undefined' && document.documentElement.scrollHeight > window.innerHeight
        ? window.scrollY / Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
        : 0

    const chapterContent = await helpers.fetchChapterContent(state.currentChapter.value)
    helpers.setCurrentChapterContent(state.currentChapter.value, chapterContent)
    helpers.updateLoadedChapter(state.currentChapter.value, chapterContent, false)
    return scrollRatio
  }

  const reloadCurrentChapter = async () => {
    await refreshChapter()
  }

  return {
    appendNextChapter,
    retryLoadNext,
    refreshChapter,
    reloadCurrentChapter,
  }
}
