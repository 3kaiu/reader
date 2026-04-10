import { computed } from 'vue'
import { createReaderNavigationBindings } from './reader-navigation-bindings'
import type { ReaderNavigationEmitFn, ReaderNavigationProps } from './reader-navigation-types'
import type {
  ReaderNavigationContentBindings,
  ReaderNavigationViewBindingResult,
} from './reader-navigation-binding-view-types'

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
