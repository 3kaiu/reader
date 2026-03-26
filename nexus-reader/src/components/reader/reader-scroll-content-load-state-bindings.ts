import { computed } from 'vue'
import type {
  ReaderScrollLoadStateProps,
} from './reader-scroll-load-state-prop-types'
import type { ReaderScrollContentProps } from './reader-scroll-content-prop-types'

export function createReaderScrollContentLoadStateBindings(
  props: Pick<
    ReaderScrollContentProps,
    | 'loadedChapters'
    | 'isParsing'
    | 'isLoadingMore'
    | 'hasNextChapter'
    | 'loadError'
  >,
) {
  return computed<ReaderScrollLoadStateProps>(() => ({
    hasLoadedChapters: props.loadedChapters.length > 0,
    isParsing: props.isParsing,
    isLoadingMore: props.isLoadingMore,
    hasNextChapter: props.hasNextChapter,
    loadError: props.loadError,
  }))
}
