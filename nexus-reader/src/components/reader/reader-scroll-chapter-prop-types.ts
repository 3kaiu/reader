import type { ReaderLoadedChapter } from './content-chapter-types'

export interface ReaderScrollChapterProps {
  chapter: ReaderLoadedChapter
  highlightContent: (content: string | undefined) => string
  handleContentClick: (event: MouseEvent) => void
}
