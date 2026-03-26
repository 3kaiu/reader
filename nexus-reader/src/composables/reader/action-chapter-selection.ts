import { nextTick } from 'vue'
import type { ReaderActionOptions } from './action-types'
import {
  scrollReaderToChapterMarker,
  scrollReaderToTop,
} from './action-scroll'

export function createReaderChapterSelectionAction(
  options: ReaderActionOptions,
) {
  return async function handleSelectChapter(index: number) {
    await options.readerStore.goToChapterInScroll(index)
    await nextTick()

    if (!scrollReaderToChapterMarker(index)) {
      scrollReaderToTop()
    }
  }
}
