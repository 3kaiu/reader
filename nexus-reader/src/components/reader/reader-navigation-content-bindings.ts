import { computed } from 'vue'
import type {
  ReaderNavigationProgressBindings,
} from './reader-navigation-binding-types'
import type {
  ReaderNavigationContentProps,
} from './reader-navigation-content-prop-types'
import type { ReaderNavigationProps } from './reader-navigation-types'

export function createReaderNavigationContentBindings(
  props: ReaderNavigationProps,
  progressBindings: ReaderNavigationProgressBindings,
) {
  return computed<ReaderNavigationContentProps>(() => ({
    hasPrevChapter: props.hasPrevChapter,
    hasNextChapter: props.hasNextChapter,
    progressText: progressBindings.progressText.value,
    progressPercent: progressBindings.progressPercent.value,
  }))
}
