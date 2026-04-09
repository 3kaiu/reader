import type { ComputedRef } from 'vue'

export interface ReaderScrollChapterViewBindings {
  chapterIndex: ComputedRef<number>
  chapterOrder: ComputedRef<number>
  chapterTitle: ComputedRef<string>
  chapterContainerStyle: ComputedRef<Record<string, string>>
  hasFormattedContent: ComputedRef<boolean>
  renderedContent: ComputedRef<string>
  onContentClick: (event: MouseEvent) => void
}
