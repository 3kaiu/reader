import type { ComputedRef, Ref } from 'vue'
import type { Chapter } from '@/types/book'
import type {
  ReaderBook,
  ReaderLoadedChapter as LoadedChapter,
} from '@/utils/readerStore'

export interface ReaderStoreState {
  currentBook: Ref<ReaderBook | null>
  currentChapter: Ref<Chapter | null>
  currentChapterIndex: Ref<number>
  content: Ref<string>
  formattedContent: Ref<string>
  catalog: Ref<Chapter[]>
  loadedChapters: Ref<LoadedChapter[]>
  isLoading: Ref<boolean>
  isLoadingMore: Ref<boolean>
  isParsing: Ref<boolean>
  error: Ref<string | null>
  loadError: Ref<string | null>
  progressMap: Ref<Record<string, number>>
  chapterContentCache: Ref<Record<string, string>>
}

export interface ReaderStoreView {
  totalChapters: ComputedRef<number>
  hasPrevChapter: ComputedRef<boolean>
  hasNextChapter: ComputedRef<boolean>
}

export interface ReaderTarget {
  sourceId: string
  bookUrl: string
}
