import { computed } from 'vue'
import type {
  ReaderNavigationContentEmitFn,
} from './reader-navigation-content-emit-types'
import type {
  ReaderNavigationContentProps,
} from './reader-navigation-content-prop-types'
import type {
  ReaderNavigationButtonBindings,
  ReaderNavigationContentViewBindingResult,
} from './reader-navigation-content-view-binding-types'

export function createReaderNavigationContentViewBindings(
  props: ReaderNavigationContentProps,
  emit: ReaderNavigationContentEmitFn,
): ReaderNavigationContentViewBindingResult {
  const previousButtonBindings = computed<ReaderNavigationButtonBindings>(() => ({
    disabled: !props.hasPrevChapter,
    onClick: () => emit('prev'),
  }))

  const nextButtonBindings = computed<ReaderNavigationButtonBindings>(() => ({
    disabled: !props.hasNextChapter,
    onClick: () => emit('next'),
  }))

  const progressProps = computed(() => ({
    progressText: props.progressText,
    progressPercent: props.progressPercent,
  }))

  return {
    previousButtonBindings,
    nextButtonBindings,
    progressProps,
  }
}
