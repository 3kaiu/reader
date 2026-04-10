import { ref } from 'vue'
import { loadPersistedReaderProgress } from '@/utils/readerStore'
import type { ReaderStoreState } from './types'

export function createReaderStoreState(): ReaderStoreState {
  return {
    currentBook: ref(null),
    currentChapter: ref(null),
    currentChapterIndex: ref(0),
    content: ref(''),
    formattedContent: ref(''),
    catalog: ref([]),
    loadedChapters: ref([]),
    isLoading: ref(false),
    isLoadingMore: ref(false),
    isParsing: ref(false),
    error: ref<string | null>(null),
    loadError: ref<string | null>(null),
    loadErrorDetails: ref<string | null>(null),
    progressMap: ref(loadPersistedReaderProgress()),
    resumeScrollPercent: ref(null),
    resumeScrollChapterIndex: ref(null),
    chapterContentCache: ref({}),
    contentStageReports: ref([]),
  }
}
