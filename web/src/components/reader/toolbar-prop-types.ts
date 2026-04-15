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
}
