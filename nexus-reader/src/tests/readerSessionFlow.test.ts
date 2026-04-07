import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createReaderActionHelpers } from '@/stores/reader/actions/helpers'
import type { ReaderStoreState } from '@/stores/reader/types'
import type { Chapter } from '@/types/book'
import { ErrorCode, NexusError } from '@/utils/errors'

const mockGetBookInfo = vi.fn()
const mockGetChapters = vi.fn()
const mockGetContent = vi.fn()

vi.mock('@/api/reader', () => ({
  readerApi: {
    getBookInfo: (...args: unknown[]) => mockGetBookInfo(...args),
    getChapters: (...args: unknown[]) => mockGetChapters(...args),
    getContent: (...args: unknown[]) => mockGetContent(...args),
  },
}))

function createReaderState(): ReaderStoreState {
  return {
    currentBook: ref({
      sourceId: 'demo-source',
      bookUrl: 'https://example.com/book/1',
      name: 'Demo',
      author: 'Author',
    }),
    currentChapter: ref(null),
    currentChapterIndex: ref(0),
    content: ref(''),
    formattedContent: ref(''),
    catalog: ref([]),
    loadedChapters: ref([]),
    isLoading: ref(false),
    isLoadingMore: ref(false),
    isParsing: ref(false),
    error: ref(null),
    loadError: ref(null),
    loadErrorDetails: ref(null),
    progressMap: ref({}),
    chapterContentCache: ref({}),
    contentStageReports: ref([]),
  }
}

describe('Reader Session Flow Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts wrapped chapters payload and normalizes invalid chapter entries', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        chapters: [
          { title: '第一章', url: 'https://example.com/book/1/1' },
          { url: 'https://example.com/book/1/2' },
          { title: '', url: 'https://example.com/book/1/3' },
          { title: '缺失URL' },
        ],
      },
    })

    const catalog = await helpers.ensureCatalog()

    expect(catalog).toHaveLength(3)
    expect(catalog[0]).toMatchObject({ title: '第一章', index: 0 })
    expect(catalog[1]).toMatchObject({ title: '第2章', index: 1 })
    expect(catalog[2]).toMatchObject({ title: '第3章', index: 2 })
  })

  it('accepts items wrapper and snake_case chapter fields', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        items: [
          {
            chapter_title: '第一章',
            chapter_url: 'https://example.com/book/1/1',
            chapter_index: 5,
          },
          {
            name: '第二章',
            chapterUrl: 'https://example.com/book/1/2',
            chapterIndex: 6,
          },
        ],
      },
    })

    const catalog = await helpers.ensureCatalog()

    expect(catalog).toHaveLength(2)
    expect(catalog[0]).toMatchObject({
      title: '第一章',
      url: 'https://example.com/book/1/1',
      index: 5,
    })
    expect(catalog[1]).toMatchObject({
      title: '第二章',
      url: 'https://example.com/book/1/2',
      index: 6,
    })
  })

  it('accepts list wrapper for catalog payload', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        list: [
          { title: '第一章', url: 'https://example.com/book/1/1' },
          { title: '第二章', url: 'https://example.com/book/1/2' },
        ],
      },
    })

    const catalog = await helpers.ensureCatalog()

    expect(catalog).toHaveLength(2)
    expect(catalog[0].title).toBe('第一章')
    expect(catalog[1].title).toBe('第二章')
  })

  it('normalizes chapter index from numeric string fields', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        data: [
          {
            chapter_title: '第一章',
            chapter_url: 'https://example.com/book/1/1',
            chapter_index: '9',
          },
          {
            title: '第二章',
            url: 'https://example.com/book/1/2',
            index: '10',
          },
        ],
      },
    })

    const catalog = await helpers.ensureCatalog()

    expect(catalog[0].index).toBe(9)
    expect(catalog[1].index).toBe(10)
  })

  it('normalizes isVip from boolean-like values', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        chapters: [
          { title: 'A', url: 'https://example.com/book/1/a', isVip: 1 },
          { title: 'B', url: 'https://example.com/book/1/b', isVip: '0' },
          { title: 'C', url: 'https://example.com/book/1/c', isVip: 'true' },
        ],
      },
    })

    const catalog = await helpers.ensureCatalog()

    expect(catalog[0].isVip).toBe(true)
    expect(catalog[1].isVip).toBe(false)
    expect(catalog[2].isVip).toBe(true)
  })

  it('normalizes vip aliases from snake_case and short key', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        chapters: [
          { title: 'A', url: 'https://example.com/book/1/a', is_vip: '1' },
          { title: 'B', url: 'https://example.com/book/1/b', vip: 0 },
        ],
      },
    })

    const catalog = await helpers.ensureCatalog()

    expect(catalog[0].isVip).toBe(true)
    expect(catalog[1].isVip).toBe(false)
  })

  it('normalizes snake_case book fields while keeping route target authoritative', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetBookInfo.mockResolvedValue({
      isSuccess: true,
      data: {
        sourceId: 'remote-source',
        source_id: 'remote-source-snake',
        bookUrl: 'https://example.com/remote',
        book_url: 'https://example.com/remote-snake',
        name: 'Snake Book',
        author: 'Snake Author',
        cover_url: 'https://example.com/cover-snake.jpg',
        dur_chapter_index: 12,
        last_chapter_index: 35,
      },
    })

    const response = await helpers.fetchBookInfo(
      'caller-source',
      'https://example.com/caller',
    )

    expect(response.isSuccess).toBe(true)
    expect(response.data).toMatchObject({
      sourceId: 'caller-source',
      bookUrl: 'https://example.com/caller',
      name: 'Snake Book',
      author: 'Snake Author',
      coverUrl: 'https://example.com/cover-snake.jpg',
      durChapterIndex: 12,
      lastChapterIndex: 35,
    })
  })

  it('supports wrapped book payload shape from getBookInfo response', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetBookInfo.mockResolvedValue({
      isSuccess: true,
      data: {
        book: {
          name: 'Wrapped Book',
          author: 'Wrapped Author',
          cover_url: 'https://example.com/wrapped-cover.jpg',
          dur_chapter_index: 8,
          last_chapter_index: 20,
        },
        source_id: 'wrapped-source',
        book_url: 'https://example.com/wrapped-book',
      },
    })

    const response = await helpers.fetchBookInfo(
      'caller-source',
      'https://example.com/caller',
    )

    expect(response.isSuccess).toBe(true)
    expect(response.data).toMatchObject({
      sourceId: 'caller-source',
      bookUrl: 'https://example.com/caller',
      name: 'Wrapped Book',
      author: 'Wrapped Author',
      coverUrl: 'https://example.com/wrapped-cover.jpg',
      durChapterIndex: 8,
      lastChapterIndex: 20,
    })
  })

  it('normalizes numeric-string chapter progress fields from book payload', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetBookInfo.mockResolvedValue({
      isSuccess: true,
      data: {
        name: 'String Number Book',
        author: 'Author',
        dur_chapter_index: '18',
        last_chapter_index: '40',
      },
    })

    const response = await helpers.fetchBookInfo(
      'caller-source',
      'https://example.com/caller',
    )

    expect(response.isSuccess).toBe(true)
    expect(response.data).toMatchObject({
      sourceId: 'caller-source',
      bookUrl: 'https://example.com/caller',
      durChapterIndex: 18,
      lastChapterIndex: 40,
    })
  })

  it('fails fast when chapter catalog is empty', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: [],
    })

    await expect(helpers.ensureCatalog()).rejects.toThrow('目录为空，暂无可读章节')
  })

  it('returns actionable error when chapter content is empty', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)
    const chapter: Chapter = {
      title: '第一章',
      url: 'https://example.com/book/1/1',
      index: 0,
    }

    mockGetContent.mockResolvedValue({
      isSuccess: true,
      data: {
        content: '   \n  ',
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

    await expect(helpers.fetchChapterContent(chapter)).rejects.toThrow(
      '章节内容为空，请重试或切换书源',
    )
    expect(state.loadErrorDetails.value).toBe('content_empty')
  })

  it('summarizes nexus error with failed stage as priority', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)
    const chapter: Chapter = {
      title: '第一章',
      url: 'https://example.com/book/1/1',
      index: 0,
    }

    mockGetContent.mockRejectedValue(
      new NexusError(
        ErrorCode.HTML_PARSE_ERROR,
        '正文解析失败',
        JSON.stringify({
          stageReports: [
            { stage: 'fetch', ok: true },
            { stage: 'decode', ok: false, failureCode: 'decode_failed' },
          ],
          failureCode: 'fallback_code',
        }),
      ),
    )

    await expect(helpers.fetchChapterContent(chapter)).rejects.toThrow(
      '正文解析失败 (阶段: decode · 代码: decode_failed)',
    )
    expect(state.loadErrorDetails.value).toBe('阶段: decode · 代码: decode_failed')
  })
})
