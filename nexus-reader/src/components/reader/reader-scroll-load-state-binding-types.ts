import type { ComputedRef } from 'vue'

export interface ReaderScrollLoadStateVisibilityBindings {
  showInitialParsing: ComputedRef<boolean>
  showLoadingMore: ComputedRef<boolean>
  showFinished: ComputedRef<boolean>
  showLoadActions: ComputedRef<boolean>
}
