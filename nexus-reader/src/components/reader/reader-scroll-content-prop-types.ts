import type { ReaderLoadedChapter } from './content-chapter-types'
import type { ReaderContentStyle } from './content-style-types'

export interface ReaderScrollContentProps {
  contentStyle: ReaderContentStyle
  loadedChapters: ReaderLoadedChapter[]
  isParsing: boolean
  isLoadingMore: boolean
  hasNextChapter: boolean
  paragraphSpacing: number
  loadError?: string | null
  highlightContent: (content: string | undefined) => string
  handleContentClick: (event: MouseEvent) => void
}
