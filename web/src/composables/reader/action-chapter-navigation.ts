import type { ReaderActionOptions } from './action-types'
import { scrollReaderToTop } from './action-scroll'

export function createReaderChapterNavigationActions(options: ReaderActionOptions) {
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

  return {
    handlePrevChapter,
    handleNextChapter,
  }
}
