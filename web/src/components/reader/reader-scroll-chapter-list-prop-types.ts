import type { ReaderLoadedChapter } from './content-chapter-types'

export interface ReaderScrollChapterListProps {
  loadedChapters: ReaderLoadedChapter[]
  layoutVersion: string
  highlightContent: (content: string | undefined) => string
  handleContentClick: (event: MouseEvent) => void
}
