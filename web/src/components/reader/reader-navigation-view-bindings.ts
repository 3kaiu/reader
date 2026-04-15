import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { createReaderNavigationBindings } from './reader-navigation-bindings'
import type { ReaderNavigationEmitFn, ReaderNavigationProps } from './reader-navigation-types'
import type { ReaderNavigationContentProps } from './reader-navigation-content-view-bindings'

export interface ReaderNavigationContentBindings extends ReaderNavigationContentProps {
  onPrev: () => void
  onNext: () => void
}

export interface ReaderNavigationViewBindingResult {
  contentBindings: ComputedRef<ReaderNavigationContentBindings>
}

export function createReaderNavigationViewBindings(
  props: ReaderNavigationProps,
  emit: ReaderNavigationEmitFn
): ReaderNavigationViewBindingResult {
  const { contentProps } = createReaderNavigationBindings(props)

  return {
    contentBindings: computed<ReaderNavigationContentBindings>(() => ({
      ...contentProps.value,
      onPrev: () => emit('prev'),
      onNext: () => emit('next'),
    })),
  }
}
