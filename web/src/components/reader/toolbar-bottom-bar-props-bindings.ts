import { computed } from 'vue'
import type { ReaderToolbarBottomBarProps } from './toolbar-bottom-bar-prop-types'
import type { ReaderToolbarProps } from './toolbar-prop-types'

export function createReaderToolbarBottomBarPropsBindings(props: ReaderToolbarProps) {
  return computed<ReaderToolbarBottomBarProps>(() => ({
    show: props.show,
    zenMode: props.zenMode,
    currentChapterIndex: props.currentChapterIndex,
    totalChapters: props.totalChapters,
    hasPrevChapter: props.hasPrevChapter,
    hasNextChapter: props.hasNextChapter,
    isNightMode: props.isNightMode,
    isEyeCareEnabled: props.isEyeCareEnabled,
    contentIssue: props.contentIssue,
  }))
}
