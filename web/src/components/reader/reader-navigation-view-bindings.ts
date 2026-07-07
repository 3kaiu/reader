import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { createReaderNavigationBindings } from './reader-navigation-bindings'
import type { ReaderNavigationProps } from './reader-navigation-types'
import type { ReaderNavigationContentProps } from './reader-navigation-content-view-bindings'

export interface ReaderNavigationContentBindings extends ReaderNavigationContentProps {
  onPrev: () => void
  onNext: () => void
}

export interface ReaderNavigationViewBindingResult {
  contentBindings: ComputedRef<ReaderNavigationContentBindings>
}

export function createReaderNavigationViewBindings(
  props: ReaderNavigationProps
): ReaderNavigationViewBindingResult {
  const { contentProps } = createReaderNavigationBindings(props)

  return {
    contentBindings: computed<ReaderNavigationContentBindings>(() => ({
      ...contentProps.value,
      onPrev: props.onPrev!,
      onNext: props.onNext!,
    })),
  }
}
