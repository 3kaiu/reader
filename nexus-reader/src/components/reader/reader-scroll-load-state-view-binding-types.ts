import type { ComputedRef } from 'vue'
import type { ReaderScrollLoadActionsProps } from './reader-scroll-load-actions-prop-types'
import type { ReaderScrollLoadingStateProps } from './reader-scroll-loading-state-prop-types'

export interface ReaderScrollLoadActionsBindings extends ReaderScrollLoadActionsProps {
  onLoadNextChapter: () => void
  onRetryLoad: () => void
}

export interface ReaderScrollLoadStateViewBindings {
  initialLoadingProps: ReaderScrollLoadingStateProps
  loadingMoreProps: ReaderScrollLoadingStateProps
  loadActionsBindings: ComputedRef<ReaderScrollLoadActionsBindings>
}
