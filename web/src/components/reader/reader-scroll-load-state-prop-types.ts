export interface ReaderScrollLoadStateProps {
  hasLoadedChapters: boolean
  isParsing: boolean
  isLoadingMore: boolean
  hasNextChapter: boolean
  loadError?: string | null
  loadErrorDetails?: string | null
}
