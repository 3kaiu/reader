import type { ComputedRef } from 'vue'
import type { createReaderNavigationContentBindings } from './reader-navigation-content-bindings'

export interface ReaderNavigationProgressBindings {
  progressText: ComputedRef<string>
  progressPercent: ComputedRef<number>
}

export interface ReaderNavigationBindingResult {
  contentProps: ReturnType<typeof createReaderNavigationContentBindings>
}
