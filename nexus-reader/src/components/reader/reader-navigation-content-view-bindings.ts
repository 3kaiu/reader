import { computed, type ComputedRef } from 'vue'
import type { ReaderNavigationContentEmitFn } from './reader-navigation-content-emit-types'
import type { ReaderNavigationButtonProps } from './reader-navigation-button-view-bindings'
import type { ReaderNavigationProgressProps } from './reader-navigation-progress-view-bindings'

export interface ReaderNavigationContentProps {
  hasPrevChapter: boolean
  hasNextChapter: boolean
  progressText: string
  progressPercent: number
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
  props: ReaderNavigationContentProps,
  emit: ReaderNavigationContentEmitFn
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
