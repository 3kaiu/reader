import { computed } from 'vue'
import type { ReaderErrorStateEmitFn } from './reader-error-state-emit-types'
import type { ReaderErrorStateProps } from './reader-error-state-prop-types'
import type { ReaderErrorStateViewBindings } from './reader-error-state-view-binding-types'

export function createReaderErrorStateViewBindings(
  props: ReaderErrorStateProps,
  emit: ReaderErrorStateEmitFn
): ReaderErrorStateViewBindings {
  return {
    errorMessage: computed(() => props.error),
    errorDetails: computed(() => props.errorDetails),
    onOpenSourcePicker: () => emit('openSourcePicker'),
    onRetryLoad: () => emit('retryLoad'),
  }
}
