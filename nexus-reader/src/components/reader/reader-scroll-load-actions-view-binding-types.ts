import type { ComputedRef } from 'vue'

export interface ReaderScrollLoadActionsViewBindings {
  hasLoadError: ComputedRef<boolean>
  onLoadNextChapter: () => void
  onRetryLoad: () => void
}
