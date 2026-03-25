import { computed } from 'vue'

export interface ReaderScrollLoadStateProps {
  hasLoadedChapters: boolean
  isParsing: boolean
  isLoadingMore: boolean
  hasNextChapter: boolean
  loadError?: string | null
}

export function createReaderScrollLoadStateBindings(
  props: ReaderScrollLoadStateProps,
) {
  const showInitialParsing = computed(
    () => props.isParsing && !props.hasLoadedChapters,
  )

  const showLoadingMore = computed(() => props.isLoadingMore)

  const showFinished = computed(
    () => !props.isLoadingMore && !props.hasNextChapter && props.hasLoadedChapters,
  )

  const showLoadActions = computed(
    () => !props.isLoadingMore && props.hasNextChapter && props.hasLoadedChapters,
  )

  const hasLoadError = computed(() => Boolean(props.loadError))

  return {
    showInitialParsing,
    showLoadingMore,
    showFinished,
    showLoadActions,
    hasLoadError,
  }
}
