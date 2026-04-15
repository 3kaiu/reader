import { computed } from 'vue'
import type { ReaderStoreState, ReaderStoreView } from './types'

export function createReaderStoreView(state: ReaderStoreState): ReaderStoreView {
  return {
    totalChapters: computed(() => state.catalog.value.length),
    hasPrevChapter: computed(() => state.currentChapterIndex.value > 0),
    hasNextChapter: computed(
      () => state.currentChapterIndex.value < state.catalog.value.length - 1
    ),
  }
}
