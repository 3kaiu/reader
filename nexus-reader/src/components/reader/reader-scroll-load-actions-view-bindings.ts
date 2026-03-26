import type {
  ReaderScrollLoadActionsEmitFn,
} from './reader-scroll-load-actions-emit-types'
import type { ReaderScrollLoadActionsProps } from './reader-scroll-load-actions-prop-types'
import {
  createReaderScrollLoadActionsBindings,
} from './reader-scroll-load-actions-bindings'
import type {
  ReaderScrollLoadActionsViewBindings,
} from './reader-scroll-load-actions-view-binding-types'

export function createReaderScrollLoadActionsViewBindings(
  props: ReaderScrollLoadActionsProps,
  emit: ReaderScrollLoadActionsEmitFn,
): ReaderScrollLoadActionsViewBindings {
  const { hasLoadError } = createReaderScrollLoadActionsBindings(props)

  return {
    hasLoadError,
    onLoadNextChapter: () => emit('loadNextChapter'),
    onRetryLoad: () => emit('retryLoad'),
  }
}
