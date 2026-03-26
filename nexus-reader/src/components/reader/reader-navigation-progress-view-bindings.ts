import { computed } from 'vue'
import type {
  ReaderNavigationProgressProps,
} from './reader-navigation-progress-prop-types'
import type {
  ReaderNavigationProgressViewBindings,
} from './reader-navigation-progress-view-binding-types'

export function createReaderNavigationProgressViewBindings(
  props: ReaderNavigationProgressProps,
): ReaderNavigationProgressViewBindings {
  return {
    chapterProgressText: computed(() => props.progressText),
    progressPercentText: computed(() => `${props.progressPercent}%`),
  }
}
