import { createReaderChapterActions } from '@/composables/reader/action-chapters'
import { createReaderActionStyles } from '@/composables/reader/action-styles'
import type { ReaderActionOptions } from '@/composables/reader/action-types'

export function useReaderActions(options: ReaderActionOptions) {
  const styleBindings = createReaderActionStyles(options)
  const chapterActions = createReaderChapterActions(options)

  return {
    ...styleBindings,
    ...chapterActions,
  }
}
