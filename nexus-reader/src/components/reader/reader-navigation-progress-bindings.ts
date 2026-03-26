import { computed } from 'vue'
import type {
  ReaderNavigationProgressBindings,
} from './reader-navigation-binding-types'
import type { ReaderNavigationProps } from './reader-navigation-types'

export function createReaderNavigationProgressBindings(
  props: ReaderNavigationProps,
): ReaderNavigationProgressBindings {
  const progressText = computed(
    () => `${props.currentChapterIndex + 1} / ${props.totalChapters}`,
  )

  const progressPercent = computed(
    () =>
      Math.round(
        ((props.currentChapterIndex + 1) / (props.totalChapters || 1)) * 100,
      ),
  )

  return {
    progressText,
    progressPercent,
  }
}
