import { computed } from 'vue'

export interface ReaderToolbarBottomBarProps {
  show: boolean
  zenMode: boolean
  currentChapterIndex: number
  totalChapters: number
  hasPrevChapter: boolean
  hasNextChapter: boolean
  isNightMode: boolean
  isEyeCareEnabled: boolean
  contentIssue?: string | null
  showDecoderAction?: boolean
  isDecoderEnabled?: boolean
  isDecoding?: boolean
}

export type ReaderToolbarBottomBarEmits = {
  toggleDayNight: []
  toggleSettings: []
  toggleEyeCare: []
  toggleZenMode: []
  refresh: []
  prevChapter: []
  nextChapter: []
  openSourcePicker: []
  openBookInfo: []
  toggleDecoder: [enabled: boolean]
  openDecoderSettings: []
}

export function createReaderToolbarBottomBarBindings(
  props: ReaderToolbarBottomBarProps,
) {
  const readingProgress = computed(
    () => ((props.currentChapterIndex + 1) / (props.totalChapters || 1)) * 100,
  )

  const navigationProps = computed(() => ({
    currentChapterIndex: props.currentChapterIndex,
    totalChapters: props.totalChapters,
    hasPrevChapter: props.hasPrevChapter,
    hasNextChapter: props.hasNextChapter,
  }))

  const actionProps = computed(() => ({
    isNightMode: props.isNightMode,
    isEyeCareEnabled: props.isEyeCareEnabled,
    contentIssue: props.contentIssue,
    showDecoderAction: props.showDecoderAction,
    isDecoderEnabled: props.isDecoderEnabled,
    isDecoding: props.isDecoding,
  }))

  return {
    readingProgress,
    navigationProps,
    actionProps,
  }
}
