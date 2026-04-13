import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createReaderSessionActions } from '@/stores/reader/actions/session'
import type { ReaderStoreState } from '@/stores/reader/types'

const mockProgressGet = vi.fn()

vi.mock('@/api/progress', () => ({
  progressApi: {
    get: (...args: unknown[]) => mockProgressGet(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

function createLocalStorageStub(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
}

function createReaderState(): ReaderStoreState {
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
    diagnosticsRequestId: ref<string | null>(null),
    diagnosticsPackageId: ref<string | null>(null),
    progressMap: ref({}),
    resumeScrollPercent: ref(null),
    resumeScrollChapterIndex: ref(null),
    chapterContentCache: ref({}),
    contentStageReports: ref([]),
  }
}

describe('Reader cloud resume override policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not override newer local progress with older cloud progress', async () => {
    vi.stubGlobal('window', {} as any)
    const localUpdatedAt = Date.now()
    const localStorage = createLocalStorageStub({
      'reader-progress-meta': JSON.stringify({
        'https://example.com/book/1': { index: 7, updatedAt: localUpdatedAt },
      }),
    })
    vi.stubGlobal('localStorage', localStorage as any)

    mockProgressGet.mockResolvedValue({
      isSuccess: true,
      data: {
        chapterIndex: 2,
        serverUpdatedAt: localUpdatedAt - 60_000,
        scrollKind: 'chapter',
        scrollPercent: 30,
      },
    })

    const state = createReaderState()
    state.progressMap.value = {
      'https://example.com/book/1': 7,
    }

    const ensureCatalog = vi
      .fn()
      .mockImplementation(async () => {
        const chapters = new Array(10).fill(null).map((_, i) => ({ index: i }))
        state.catalog.value = chapters as any
        return chapters as any
      })
    const loadChapterAt = vi.fn().mockResolvedValue(undefined)

    const actions = createReaderSessionActions(state, {
      fetchBookInfo: vi.fn() as any,
      isCurrentBookTarget: vi.fn().mockReturnValue(false),
      hasActiveSession: vi.fn().mockReturnValue(false),
      ensureCatalog,
      loadChapterAt,
    })

    await actions.openBook({
      sourceId: 'demo-source',
      bookUrl: 'https://example.com/book/1',
      name: 'Demo',
      author: 'Author',
    } as any)

    // Local should win; loadChapterAt should use persisted local index.
    expect(loadChapterAt).toHaveBeenCalledWith(7, { replaceLoaded: true })
    // Cloud scroll resume should not apply if cloud progress was not adopted.
    expect(state.resumeScrollPercent.value).toBeNull()
    expect(state.resumeScrollChapterIndex.value).toBeNull()
  })

  it('treats local progress as new when meta is missing (upgrade safety)', async () => {
    vi.stubGlobal('window', {} as any)
    const localStorage = createLocalStorageStub({
      // meta is intentionally missing to simulate upgrade from older versions
    })
    vi.stubGlobal('localStorage', localStorage as any)

    const now = Date.now()
    mockProgressGet.mockResolvedValue({
      isSuccess: true,
      data: {
        chapterIndex: 2,
        serverUpdatedAt: now - 60_000,
        scrollKind: 'chapter',
        scrollPercent: 30,
      },
    })

    const state = createReaderState()
    state.progressMap.value = {
      'https://example.com/book/1': 7,
    }

    const ensureCatalog = vi
      .fn()
      .mockImplementation(async () => {
        const chapters = new Array(10).fill(null).map((_, i) => ({ index: i }))
        state.catalog.value = chapters as any
        return chapters as any
      })
    const loadChapterAt = vi.fn().mockResolvedValue(undefined)

    const actions = createReaderSessionActions(state, {
      fetchBookInfo: vi.fn() as any,
      isCurrentBookTarget: vi.fn().mockReturnValue(false),
      hasActiveSession: vi.fn().mockReturnValue(false),
      ensureCatalog,
      loadChapterAt,
    })

    await actions.openBook({
      sourceId: 'demo-source',
      bookUrl: 'https://example.com/book/1',
      name: 'Demo',
      author: 'Author',
    } as any)

    expect(loadChapterAt).toHaveBeenCalledWith(7, { replaceLoaded: true })
  })
})

