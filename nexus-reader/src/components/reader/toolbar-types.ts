export interface ReaderToolbarProps {
  show: boolean
  zenMode: boolean
  bookName?: string
  chapterTitle?: string
  currentChapterIndex: number
  totalChapters: number
  hasPrevChapter: boolean
  hasNextChapter: boolean
  isNightMode: boolean
  isFullscreen: boolean
  isEyeCareEnabled: boolean
  contentIssue?: string | null
  showDecoderAction?: boolean
  isDecoderEnabled?: boolean
  isDecoding?: boolean
}

export type ReaderToolbarEmits = {
  back: []
  toggleCatalog: []
  toggleSettings: []
  toggleDayNight: []
  toggleFullscreen: []
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
