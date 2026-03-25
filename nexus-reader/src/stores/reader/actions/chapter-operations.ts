import type { Chapter } from '@/types/book'
import type { ReaderStoreState, ReaderStoreView } from '../types'

export function createReaderChapterOperations(
  state: ReaderStoreState,
  view: ReaderStoreView,
  helpers: {
    fetchChapterContent: (chapter: Chapter) => Promise<string>
    setCurrentChapterContent: (
      chapter: Chapter,
      chapterContent: string,
    ) => void
    updateLoadedChapter: (
      chapter: Chapter,
      chapterContent: string,
      replaceOnly?: boolean,
    ) => void
  },
) {
  const appendNextChapter = async (): Promise<boolean> => {
    if (
      !view.hasNextChapter.value ||
      !state.catalog.value[state.currentChapterIndex.value + 1]
    ) {
      return false
    }

    state.isLoadingMore.value = true
    state.loadError.value = null

    try {
      const next = state.catalog.value[state.currentChapterIndex.value + 1]
      const chapterContent = await helpers.fetchChapterContent(next)
      helpers.updateLoadedChapter(next, chapterContent, false)
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
    return await appendNextChapter()
  }

  const refreshChapter = async (): Promise<number> => {
    if (!state.currentChapter.value) {
      return 0
    }

    const scrollRatio =
      typeof window !== 'undefined' && document.documentElement.scrollHeight > window.innerHeight
        ? window.scrollY /
          Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
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
