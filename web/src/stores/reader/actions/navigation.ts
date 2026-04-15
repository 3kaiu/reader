import type { ReaderStoreState, ReaderStoreView } from '../types'

interface ReaderNavigationHelpers {
  loadChapterAt: (index: number, options?: { replaceLoaded?: boolean }) => Promise<void>
}

export function createReaderNavigationActions(
  state: ReaderStoreState,
  view: ReaderStoreView,
  helpers: ReaderNavigationHelpers
) {
  const goToChapter = async (index: number) => {
    state.isLoading.value = true
    state.error.value = null

    try {
      await helpers.loadChapterAt(index, { replaceLoaded: true })
    } catch (err) {
      state.error.value = err instanceof Error ? err.message : '跳转章节失败'
      throw err
    } finally {
      state.isLoading.value = false
    }
  }

  const goToChapterInScroll = async (index: number) => {
    await goToChapter(index)
  }

  const nextChapter = async () => {
    if (!view.hasNextChapter.value) {
      return
    }

    await goToChapter(state.currentChapterIndex.value + 1)
  }

  const prevChapter = async () => {
    if (!view.hasPrevChapter.value) {
      return
    }

    await goToChapter(state.currentChapterIndex.value - 1)
  }

  return {
    goToChapter,
    goToChapterInScroll,
    nextChapter,
    prevChapter,
  }
}
