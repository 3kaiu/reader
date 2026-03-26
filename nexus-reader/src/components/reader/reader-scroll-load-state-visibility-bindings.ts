import { computed } from 'vue'
import type { ReaderScrollLoadStateProps } from './reader-scroll-load-state-prop-types'
import type {
  ReaderScrollLoadStateVisibilityBindings,
} from './reader-scroll-load-state-binding-types'

export function createReaderScrollLoadStateVisibilityBindings(
  props: ReaderScrollLoadStateProps,
): ReaderScrollLoadStateVisibilityBindings {
  const showInitialParsing = computed(
    () => props.isParsing && !props.hasLoadedChapters,
  )

  const showLoadingMore = computed(() => props.isLoadingMore)

  const showFinished = computed(
    () =>
      !props.isLoadingMore &&
      !props.hasNextChapter &&
      props.hasLoadedChapters,
  )

  const showLoadActions = computed(
    () =>
      !props.isLoadingMore &&
      props.hasNextChapter &&
      props.hasLoadedChapters,
  )

  return {
    showInitialParsing,
    showLoadingMore,
    showFinished,
    showLoadActions,
  }
}
