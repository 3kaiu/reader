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
  isDecoding?: boolean
}
