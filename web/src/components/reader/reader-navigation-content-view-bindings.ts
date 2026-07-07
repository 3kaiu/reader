import { computed, type ComputedRef } from 'vue'
import type { ReaderNavigationButtonProps } from './reader-navigation-button-view-bindings'
import type { ReaderNavigationProgressProps } from './reader-navigation-progress-view-bindings'

export interface ReaderNavigationContentProps {
  hasPrevChapter: boolean
  hasNextChapter: boolean
  progressText: string
  progressPercent: number
  onPrev: () => void
  onNext: () => void
}

export interface ReaderNavigationButtonBindings extends ReaderNavigationButtonProps {
  onClick: () => void
}

export interface ReaderNavigationContentViewBindingResult {
  previousButtonBindings: ComputedRef<ReaderNavigationButtonBindings>
  nextButtonBindings: ComputedRef<ReaderNavigationButtonBindings>
  progressProps: ComputedRef<ReaderNavigationProgressProps>
}

export function createReaderNavigationContentViewBindings(
  props: ReaderNavigationContentProps
): ReaderNavigationContentViewBindingResult {
  const previousButtonBindings = computed<ReaderNavigationButtonBindings>(() => ({
    disabled: !props.hasPrevChapter,
    onClick: props.onPrev,
  }))

  const nextButtonBindings = computed<ReaderNavigationButtonBindings>(() => ({
    disabled: !props.hasNextChapter,
    onClick: props.onNext,
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
