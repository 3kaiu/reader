import { computed } from 'vue'
import type { ReaderScrollLoadStateEmitFn } from './reader-scroll-load-state-emit-types'
import type { ReaderScrollLoadStateProps } from './reader-scroll-load-state-prop-types'
import type { ReaderScrollLoadStateViewBindings } from './reader-scroll-load-state-view-binding-types'

export function createReaderScrollLoadStateViewBindings(
  props: ReaderScrollLoadStateProps,
  emit: ReaderScrollLoadStateEmitFn
): ReaderScrollLoadStateViewBindings {
  return {
    initialLoadingProps: {
      message: '正在解析章节...',
      containerClass: 'py-20 text-center',
    },
    loadingMoreProps: {
      message: '正在加载下一章...',
    },
    loadActionsBindings: computed(() => ({
      loadError: props.loadError,
      loadErrorDetails: props.loadErrorDetails,
      onLoadNextChapter: () => emit('loadNextChapter'),
      onRetryLoad: () => emit('retryLoad'),
    })),
  }
}
