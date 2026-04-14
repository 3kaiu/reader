import { computed } from 'vue'
import type { ReaderScrollLoadStateEmitFn } from './reader-scroll-load-state-emit-types'
import type { ReaderScrollLoadActionsProps } from './reader-scroll-load-actions-prop-types'
import type { ReaderScrollLoadStateProps } from './reader-scroll-load-state-prop-types'

export function createReaderScrollLoadStateViewBindings(
  props: ReaderScrollLoadStateProps,
  emit: ReaderScrollLoadStateEmitFn
) {
  return {
    initialLoadingProps: {
      message: '正在解析章节...',
      containerClass: 'py-20 text-center',
    },
    loadingMoreProps: {
      message: '正在加载下一章...',
    },
    loadActionsBindings: computed<ReaderScrollLoadActionsProps>(() => ({
      loadError: props.loadError,
      loadErrorDetails: props.loadErrorDetails,
      onLoadNextChapter: () => emit('loadNextChapter'),
      onRetryLoad: () => emit('retryLoad'),
    })),
  }
}
