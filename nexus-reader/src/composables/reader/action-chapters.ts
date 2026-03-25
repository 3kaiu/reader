import { nextTick } from 'vue'
import type { ReaderActionOptions } from './action-types'
import {
  restoreReaderRefreshPosition,
  scrollReaderToChapterMarker,
  scrollReaderToTop,
} from './action-scroll'

export function createReaderChapterActions(options: ReaderActionOptions) {
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

  const handleRefresh = async () => {
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

  const handleSelectChapter = async (index: number) => {
    await options.readerStore.goToChapterInScroll(index)
    await nextTick()

    if (!scrollReaderToChapterMarker(index)) {
      scrollReaderToTop()
    }
  }

  return {
    handlePrevChapter,
    handleNextChapter,
    handleRefresh,
    handleSelectChapter,
  }
}
