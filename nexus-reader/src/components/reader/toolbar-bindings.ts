import { computed, toRef } from 'vue'
import type { ReaderToolbarProps } from './toolbar-types'

export function createReaderToolbarBindings(props: ReaderToolbarProps) {
  const topBarProps = computed(() => ({
    show: props.show,
    zenMode: props.zenMode,
    bookName: props.bookName,
    chapterTitle: props.chapterTitle,
    isFullscreen: props.isFullscreen,
  }))

  const bottomBarProps = computed(() => ({
    show: props.show,
    zenMode: props.zenMode,
    currentChapterIndex: props.currentChapterIndex,
    totalChapters: props.totalChapters,
    hasPrevChapter: props.hasPrevChapter,
    hasNextChapter: props.hasNextChapter,
    isNightMode: props.isNightMode,
    isEyeCareEnabled: props.isEyeCareEnabled,
    contentIssue: props.contentIssue,
    showDecoderAction: props.showDecoderAction,
    isDecoderEnabled: props.isDecoderEnabled,
    isDecoding: props.isDecoding,
  }))

  return {
    topBarProps,
    bottomBarProps,
    zenMode: toRef(props, 'zenMode'),
  }
}
