import { nextTick } from 'vue'
import type { ReaderActionOptions } from './action-types'

// ═══════════════════════════════════════════════════════════════════════
// Scroll utilities
// ═══════════════════════════════════════════════════════════════════════

export function scrollReaderToTop(behavior: ScrollBehavior = 'smooth'): void {
  window.scrollTo({ top: 0, behavior })
}

export function restoreReaderRefreshPosition(scrollRatio: number): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const newScrollHeight = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({
        top: scrollRatio * newScrollHeight,
        behavior: 'auto',
      })
    })
  })
}

export function scrollReaderToChapterMarker(index: number): boolean {
  const chapterMarker = document.querySelector(`[data-chapter-index='${index}']`)

  if (!(chapterMarker instanceof HTMLElement)) {
    return false
  }

  chapterMarker.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })

  return true
}

// ═══════════════════════════════════════════════════════════════════════
// Chapter actions
// ═══════════════════════════════════════════════════════════════════════

function createReaderChapterNavigationActions(options: ReaderActionOptions) {
  const handlePrevChapter = async () => {
    if (!options.readerStore.hasPrevChapter) {
      return
    }

    await options.readerStore.prevChapter()
    scrollReaderToTop()
  }

  const handleNextChapter = async () => {
    if (!options.readerStore.hasNextChapter) {
      return
    }

    await options.readerStore.nextChapter()
    scrollReaderToTop()
  }

  return { handlePrevChapter, handleNextChapter }
}

function createReaderChapterRefreshAction(options: ReaderActionOptions) {
  return async function handleRefresh() {
    try {
      const scrollRatio = await options.readerStore.refreshChapter()
      await nextTick()
      restoreReaderRefreshPosition(scrollRatio)
    } catch (error) {
      options.toast({
        title: '刷新失败',
        description: error instanceof Error ? error.message : '章节刷新失败',
        duration: 3000,
      })
    }
  }
}

function createReaderChapterSelectionAction(options: ReaderActionOptions) {
  return async function handleSelectChapter(index: number) {
    await options.readerStore.goToChapterInScroll(index)
    await nextTick()

    if (!scrollReaderToChapterMarker(index)) {
      scrollReaderToTop()
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════

export function createReaderChapterActions(options: ReaderActionOptions) {
  const { handlePrevChapter, handleNextChapter } = createReaderChapterNavigationActions(options)
  const handleRefresh = createReaderChapterRefreshAction(options)
  const handleSelectChapter = createReaderChapterSelectionAction(options)

  return {
    handlePrevChapter,
    handleNextChapter,
    handleRefresh,
    handleSelectChapter,
  }
}
