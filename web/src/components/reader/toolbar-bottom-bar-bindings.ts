import { computed } from 'vue'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'
import type { ReaderNavigationProps } from './reader-navigation-types'
import type { ReaderToolbarBottomBarProps } from './toolbar-bottom-bar-prop-types'

export function createReaderToolbarBottomBarBindings(props: ReaderToolbarBottomBarProps) {
  const readingProgress = computed(
    () => ((props.currentChapterIndex + 1) / (props.totalChapters || 1)) * 100
  )

  const navigationProps = computed<ReaderNavigationProps>(() => ({
    currentChapterIndex: props.currentChapterIndex,
    totalChapters: props.totalChapters,
    hasPrevChapter: props.hasPrevChapter,
    hasNextChapter: props.hasNextChapter,
    onPrev: props.onPrevChapter,
    onNext: props.onNextChapter,
  }))

  const actionProps = computed<ReaderToolbarBottomActionsProps>(() => ({
    isNightMode: props.isNightMode,
    isEyeCareEnabled: props.isEyeCareEnabled,
    contentIssue: props.contentIssue,
  }))

  return {
    readingProgress,
    navigationProps,
    actionProps,
  }
}
