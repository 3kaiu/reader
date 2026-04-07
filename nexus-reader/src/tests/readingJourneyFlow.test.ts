import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReaderStore } from '@/stores/reader'
import { useSearchStore } from '@/stores/search'

const mockSearchBooksStream = vi.fn()
const mockSearchBooks = vi.fn()
const mockGetBookInfo = vi.fn()
const mockGetChapters = vi.fn()
const mockGetContent = vi.fn()

vi.mock('@vueuse/core', () => ({
  useStorage: <T>(_key: string, initialValue: T) => ({ value: initialValue }),
}))

vi.mock('@/api/search', () => ({
  searchApi: {
    searchBooksStream: (...args: unknown[]) => mockSearchBooksStream(...args),
    searchBooks: (...args: unknown[]) => mockSearchBooks(...args),
  },
}))

vi.mock('@/api/reader', () => ({
  readerApi: {
    getBookInfo: (...args: unknown[]) => mockGetBookInfo(...args),
    getChapters: (...args: unknown[]) => mockGetChapters(...args),
    getContent: (...args: unknown[]) => mockGetContent(...args),
  },
}))

describe('Reading Journey Flow (Search -> Reader Session)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('loads search result and starts reader session successfully', async () => {
    const searchStore = useSearchStore()
    const readerStore = useReaderStore()

    mockSearchBooksStream.mockImplementation(
      async (
        _keyword: string,
        _sources: string[],
        options: { onResult?: (result: any) => void },
      ) => {
        options.onResult?.({
          sourceId: 'demo-source',
          sourceName: 'Demo Source',
          bookUrl: 'https://example.com/book/1',
          name: '测试小说',
          author: '作者A',
          coverUrl: 'https://example.com/cover.jpg',
        })
      },
    )

    mockGetBookInfo.mockResolvedValue({
      isSuccess: true,
      data: {
        sourceId: 'demo-source',
        bookUrl: 'https://example.com/book/1',
        name: '测试小说',
        author: '作者A',
      },
    })
    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: [
        { title: '第一章', url: 'https://example.com/book/1/1', index: 0 },
        { title: '第二章', url: 'https://example.com/book/1/2', index: 1 },
      ],
    })
    mockGetContent.mockResolvedValue({
      isSuccess: true,
      data: {
        content: '这是第一章正文',
        meta: { stageReports: [] },
      },
    })

    const searchOutcome = await searchStore.search('测试小说')
    expect(searchOutcome?.type).toBe('success')
    expect(searchStore.searchResult).toHaveLength(1)

    const startOutcome = await readerStore.startReaderSession(
      searchStore.searchResult[0].sourceId,
      searchStore.searchResult[0].bookUrl,
    )

    expect(startOutcome.isSuccess).toBe(true)
    expect(readerStore.currentBook?.name).toBe('测试小说')
    expect(readerStore.catalog).toHaveLength(2)
    expect(readerStore.currentChapter?.title).toBe('第一章')
    expect(readerStore.content).toContain('这是第一章正文')
    expect(readerStore.error).toBeNull()
    expect(readerStore.loadError).toBeNull()
  })

  it('fails with actionable state when chapter content loading fails', async () => {
    const searchStore = useSearchStore()
    const readerStore = useReaderStore()

    mockSearchBooksStream.mockImplementation(
      async (
        _keyword: string,
        _sources: string[],
        options: { onResult?: (result: any) => void },
      ) => {
        options.onResult?.({
          sourceId: 'demo-source',
          sourceName: 'Demo Source',
          bookUrl: 'https://example.com/book/1',
          name: '测试小说',
          author: '作者A',
        })
      },
    )

    mockGetBookInfo.mockResolvedValue({
      isSuccess: true,
      data: {
        sourceId: 'demo-source',
        bookUrl: 'https://example.com/book/1',
        name: '测试小说',
        author: '作者A',
      },
    })
    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: [{ title: '第一章', url: 'https://example.com/book/1/1', index: 0 }],
    })
    mockGetContent.mockResolvedValue({
      isSuccess: true,
      data: {
        content: '   ',
        meta: {
          stageReports: [
            {
              stage: 'validation',
              ok: false,
              failureCode: 'content_empty',
            },
          ],
        },
      },
    })

    await searchStore.search('测试小说')

    await expect(
      readerStore.startReaderSession(
        searchStore.searchResult[0].sourceId,
        searchStore.searchResult[0].bookUrl,
      ),
    ).rejects.toThrow('章节内容为空，请重试或切换书源')

    expect(readerStore.error).toBe('章节内容为空，请重试或切换书源')
    expect(readerStore.loadErrorDetails).toBe('content_empty')
  })

  it('persists fetch-book-info failure into reader error state', async () => {
    const readerStore = useReaderStore()

    mockGetBookInfo.mockResolvedValue({
      isSuccess: false,
      errorMsg: '书籍信息服务暂时不可用',
    })

    const response = await readerStore.startReaderSession(
      'demo-source',
      'https://example.com/book/failed',
    )

    expect(response.isSuccess).toBe(false)
    expect(response.errorMsg).toBe('书籍信息服务暂时不可用')
    expect(readerStore.error).toBe('书籍信息服务暂时不可用')
    expect(readerStore.loadError).toBe('书籍信息服务暂时不可用')
    expect(readerStore.loadErrorDetails).toBeNull()
    expect(readerStore.isLoading).toBe(false)
  })
})
