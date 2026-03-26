import type { ReaderActionOptions } from './action-types'
import {
  createReaderChapterNavigationActions,
} from './action-chapter-navigation'
import { createReaderChapterRefreshAction } from './action-chapter-refresh'
import {
  createReaderChapterSelectionAction,
} from './action-chapter-selection'

export function createReaderChapterActions(options: ReaderActionOptions) {
  const {
    handlePrevChapter,
    handleNextChapter,
  } = createReaderChapterNavigationActions(options)
  const handleRefresh = createReaderChapterRefreshAction(options)
  const handleSelectChapter = createReaderChapterSelectionAction(options)

  return {
    handlePrevChapter,
    handleNextChapter,
    handleRefresh,
    handleSelectChapter,
  }
}
