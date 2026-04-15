import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ReaderNavigationProps } from './reader-navigation-types'

export interface ReaderNavigationProgressBindings {
  progressText: ComputedRef<string>
  progressPercent: ComputedRef<number>
}

export function createReaderNavigationProgressBindings(
  props: ReaderNavigationProps
): ReaderNavigationProgressBindings {
  const progressText = computed(() => `${props.currentChapterIndex + 1} / ${props.totalChapters}`)

  const progressPercent = computed(() =>
    Math.round(((props.currentChapterIndex + 1) / (props.totalChapters || 1)) * 100)
  )

  return {
    progressText,
    progressPercent,
  }
}
