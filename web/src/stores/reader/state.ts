import { ref, shallowRef } from 'vue'
import { loadPersistedReaderProgress } from '@/stores/reader/helpers'
import type { ReaderStageReport, ReaderStoreState } from './types'

export function createReaderStoreState(): ReaderStoreState {
  return {
    currentBook: ref(null),
    currentChapter: ref(null),
    currentChapterIndex: ref(0),
    content: ref(''),
    formattedContent: ref(''),
    catalog: shallowRef([]),
    loadedChapters: shallowRef([]),
    isLoading: ref(false),
    isLoadingMore: ref(false),
    isParsing: ref(false),
    error: ref<string | null>(null),
    loadError: ref<string | null>(null),
    loadErrorDetails: ref<string | null>(null),
    diagnosticsRequestId: ref<string | null>(null),
    diagnosticsPackageId: ref<string | null>(null),
    progressMap: shallowRef(loadPersistedReaderProgress()),
    chapterContentCache: shallowRef<Record<string, string>>({}),
    contentStageReports: shallowRef<ReaderStageReport[]>([]),
  }
}
