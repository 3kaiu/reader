export interface ReaderScrollLoadActionsProps {
  loadError?: string | null
  loadErrorDetails?: string | null
  onLoadNextChapter: () => void
  onRetryLoad: () => void
}
