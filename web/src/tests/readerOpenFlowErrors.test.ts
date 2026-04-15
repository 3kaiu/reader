import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useSearchActions } from '@/composables/useSearchActions'
import { createReaderSessionActions } from '@/stores/reader/actions/session'
import type { ReaderStoreState } from '@/stores/reader/types'
import type { SearchResult } from '@/types/search'

const mockOpenReader = vi.fn()

vi.mock('@/composables/useOpenReader', () => ({
  useOpenReader: () => ({
    openReader: (...args: unknown[]) => mockOpenReader(...args),
  }),
}))

function createSearchBook(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    bookUrl: 'https://example.com/book/1',
    name: '测试小说',
    author: '作者A',
    sourceId: 'demo-source',
    sourceName: 'Demo Source',
    ...overrides,
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
    chapterContentCache: ref({}),
    contentStageReports: ref([]),
  }
}

describe('Search -> Open Reader Error Semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows actionable message when reader navigation fails', async () => {
    mockOpenReader.mockResolvedValue({ navigated: false })

    const showError = vi.fn()
    const handlePromiseError = vi.fn()
    const actions = useSearchActions({
      searchKeyword: ref(''),
      books: ref([]),
      libraryStore: { ensureBook: vi.fn() } as any,
      searchStore: {
        stopSearch: vi.fn(),
        search: vi.fn(),
        clearHistory: vi.fn(),
        toggleSource: vi.fn(),
        clearSourceFilter: vi.fn(),
        reset: vi.fn(),
        rememberPreferredSource: vi.fn(),
      } as any,
      warning: vi.fn(),
      success: vi.fn(),
      showError,
      handleApiError: vi.fn(),
      handlePromiseError,
    })

    await actions.openBook(createSearchBook())

    expect(showError).toHaveBeenCalledWith('打开《测试小说》失败，请重试或切换书源')
    expect(handlePromiseError).not.toHaveBeenCalled()
  })

  it('keeps user-facing message and suppresses duplicate toast on exception', async () => {
    mockOpenReader.mockRejectedValue(new Error('网络超时'))

    const showError = vi.fn()
    const handlePromiseError = vi.fn()
    const actions = useSearchActions({
      searchKeyword: ref(''),
      books: ref([]),
      libraryStore: { ensureBook: vi.fn() } as any,
      searchStore: {
        stopSearch: vi.fn(),
        search: vi.fn(),
        clearHistory: vi.fn(),
        toggleSource: vi.fn(),
        clearSourceFilter: vi.fn(),
        reset: vi.fn(),
        rememberPreferredSource: vi.fn(),
      } as any,
      warning: vi.fn(),
      success: vi.fn(),
      showError,
      handleApiError: vi.fn(),
      handlePromiseError,
    })

    await actions.openBook(createSearchBook())

    expect(showError).toHaveBeenCalledWith('打开《测试小说》失败：网络超时')
    expect(handlePromiseError).toHaveBeenCalledWith(
      expect.any(Error),
      '打开《测试小说》失败：网络超时',
      false
    )
  })
})

describe('Reader Session Failure State', () => {
  it('writes failure message into reader error state when start session fails', async () => {
    const state = createReaderState()
    const actions = createReaderSessionActions(state, {
      fetchBookInfo: vi.fn().mockResolvedValue({
        isSuccess: false,
        data: null,
        errorMsg: '书籍信息获取失败',
      }),
      isCurrentBookTarget: vi.fn().mockReturnValue(false),
      hasActiveSession: vi.fn().mockReturnValue(false),
      ensureCatalog: vi.fn(),
      loadChapterAt: vi.fn(),
    })

    const response = await actions.startReaderSession('demo-source', 'https://example.com/book/1')

    expect(response.isSuccess).toBe(false)
    expect(state.error.value).toBe('书籍信息获取失败')
    expect(state.loadError.value).toBe('书籍信息获取失败')
    expect(state.loadErrorDetails.value).toBeNull()
    expect(state.isLoading.value).toBe(false)
  })
})
