import type { Chapter } from '@/types/book'

export interface ChapterListDownloadProgress {
  current: number
  total: number
}

export type FilteredChapterItem = Chapter & {
  originalIndex: number
}

export interface ChapterListVirtualItem {
  index: number
  data: FilteredChapterItem
}
