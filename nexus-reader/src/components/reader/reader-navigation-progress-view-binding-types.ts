import type { ComputedRef } from 'vue'

export interface ReaderNavigationProgressViewBindings {
  chapterProgressText: ComputedRef<string>
  progressPercentText: ComputedRef<string>
}
