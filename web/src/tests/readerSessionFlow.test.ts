import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createReaderActionHelpers, resetReaderServices } from '@/stores/reader/actions/helpers'
import type { ReaderStoreState } from '@/stores/reader/types'
import type { Chapter } from '@/types/book'
import { ErrorCode, NexusError } from '@/utils/errors'

const mockGetBookInfo = vi.fn()
const mockGetChapters = vi.fn()
const mockGetContent = vi.fn()
const mockBatchContent = vi.fn()

vi.mock('@/api/reader', () => ({
  readerApi: {
    getBookInfo: (...args: unknown[]) => mockGetBookInfo(...args),
    getChapters: (...args: unknown[]) => mockGetChapters(...args),
    getContent: (...args: unknown[]) => mockGetContent(...args),
    batchContent: (...args: unknown[]) => mockBatchContent(...args),
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
    diagnosticsRequestId: ref<string | null>(null),
    diagnosticsPackageId: ref<string | null>(null),
    progressMap: ref({}),
    chapterContentCache: ref({}),
    contentStageReports: ref([]),
  }
}

describe('Reader Session Flow Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetReaderServices()
    mockBatchContent.mockResolvedValue({ isSuccess: true, data: { results: [] } })
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

  it('accepts nested data.items wrapper for catalog payload', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        data: {
          items: [
            { title: '第一章', url: 'https://example.com/book/1/1' },
            { title: '第二章', url: 'https://example.com/book/1/2' },
          ],
        },
      },
    })

    const catalog = await helpers.ensureCatalog()

    expect(catalog).toHaveLength(2)
    expect(catalog[0].title).toBe('第一章')
    expect(catalog[1].title).toBe('第二章')
  })

  it('accepts stringified JSON catalog payload', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: JSON.stringify({
        chapters: [
          { title: '第一章', url: 'https://example.com/book/1/1' },
          { title: '第二章', url: 'https://example.com/book/1/2' },
        ],
      }),
    })

    const catalog = await helpers.ensureCatalog()
    expect(catalog).toHaveLength(2)
    expect(catalog[0].title).toBe('第一章')
    expect(catalog[1].title).toBe('第二章')
  })

  it('accepts results wrapper for catalog payload', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        results: [
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

  it('accepts chapter url aliases like href and link', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        chapters: [
          { title: '第一章', href: 'https://example.com/book/1/1' },
          { title: '第二章', link: 'https://example.com/book/1/2' },
        ],
      },
    })

    const catalog = await helpers.ensureCatalog()

    expect(catalog).toHaveLength(2)
    expect(catalog[0].url).toBe('https://example.com/book/1/1')
    expect(catalog[1].url).toBe('https://example.com/book/1/2')
  })

  it('accepts chapter href/name aliases and chapter_list wrapper', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        chapter_list: [
          {
            chapter_name: '第一章',
            chapter_href: 'https://example.com/book/1/1',
          },
          {
            chapterName: '第二章',
            chapterHref: 'https://example.com/book/1/2',
          },
        ],
      },
    })

    const catalog = await helpers.ensureCatalog()

    expect(catalog).toHaveLength(2)
    expect(catalog[0]).toMatchObject({
      title: '第一章',
      url: 'https://example.com/book/1/1',
    })
    expect(catalog[1]).toMatchObject({
      title: '第二章',
      url: 'https://example.com/book/1/2',
    })
  })

  it('falls back to next chapter url alias when earlier value is empty', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        chapters: [
          {
            title: '第一章',
            url: '   ',
            chapter_url: 'https://example.com/book/1/1',
          },
        ],
      },
    })

    const catalog = await helpers.ensureCatalog()
    expect(catalog).toHaveLength(1)
    expect(catalog[0].url).toBe('https://example.com/book/1/1')
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

  it('normalizes vip semantic aliases and yes/off variants', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetChapters.mockResolvedValue({
      isSuccess: true,
      data: {
        chapters: [
          { title: 'A', url: 'https://example.com/book/1/a', is_paid: 'yes' },
          { title: 'B', url: 'https://example.com/book/1/b', isPaid: 'off' },
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

    const response = await helpers.fetchBookInfo('caller-source', 'https://example.com/caller')

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

    const response = await helpers.fetchBookInfo('caller-source', 'https://example.com/caller')

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

  it('normalizes stringified JSON book payload', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetBookInfo.mockResolvedValue({
      isSuccess: true,
      data: JSON.stringify({
        title: 'JSON Book',
        writer: 'JSON Author',
        summary: 'JSON Intro',
      }),
    })

    const response = await helpers.fetchBookInfo('caller-source', 'https://example.com/caller')

    expect(response.isSuccess).toBe(true)
    expect(response.data).toMatchObject({
      sourceId: 'caller-source',
      bookUrl: 'https://example.com/caller',
      name: 'JSON Book',
      author: 'JSON Author',
      intro: 'JSON Intro',
    })
  })

  it('supports book_info wrapper aliases in book payload', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetBookInfo.mockResolvedValue({
      isSuccess: true,
      data: {
        book_info: {
          title: 'Wrapped Alias Book',
          writer: 'Wrapped Alias Author',
        },
      },
    })

    const response = await helpers.fetchBookInfo('caller-source', 'https://example.com/caller')

    expect(response.isSuccess).toBe(true)
    expect(response.data).toMatchObject({
      sourceId: 'caller-source',
      bookUrl: 'https://example.com/caller',
      name: 'Wrapped Alias Book',
      author: 'Wrapped Alias Author',
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

    const response = await helpers.fetchBookInfo('caller-source', 'https://example.com/caller')

    expect(response.isSuccess).toBe(true)
    expect(response.data).toMatchObject({
      sourceId: 'caller-source',
      bookUrl: 'https://example.com/caller',
      durChapterIndex: 18,
      lastChapterIndex: 40,
    })
  })

  it('normalizes book field aliases for title writer and description', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetBookInfo.mockResolvedValue({
      isSuccess: true,
      data: {
        title: 'Alias Title',
        writer: 'Alias Writer',
        description: 'Alias Intro',
      },
    })

    const response = await helpers.fetchBookInfo('caller-source', 'https://example.com/caller')

    expect(response.isSuccess).toBe(true)
    expect(response.data).toMatchObject({
      sourceId: 'caller-source',
      bookUrl: 'https://example.com/caller',
      name: 'Alias Title',
      author: 'Alias Writer',
      intro: 'Alias Intro',
    })
  })

  it('falls back to secondary book aliases when primary fields are blank', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetBookInfo.mockResolvedValue({
      isSuccess: true,
      data: {
        name: '   ',
        title: 'Fallback Title',
        author: '',
        writer: 'Fallback Writer',
        intro: '   ',
        description: 'Fallback Intro',
      },
    })

    const response = await helpers.fetchBookInfo('caller-source', 'https://example.com/caller')

    expect(response.isSuccess).toBe(true)
    expect(response.data).toMatchObject({
      name: 'Fallback Title',
      author: 'Fallback Writer',
      intro: 'Fallback Intro',
    })
  })

  it('normalizes extended aliases for author cover and intro', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)

    mockGetBookInfo.mockResolvedValue({
      isSuccess: true,
      data: {
        title: 'Alias Book',
        author_name: 'Alias Author',
        image: 'https://example.com/alias-cover.jpg',
        summary: 'Alias Summary',
      },
    })

    const response = await helpers.fetchBookInfo('caller-source', 'https://example.com/caller')

    expect(response.isSuccess).toBe(true)
    expect(response.data).toMatchObject({
      sourceId: 'caller-source',
      bookUrl: 'https://example.com/caller',
      name: 'Alias Book',
      author: 'Alias Author',
      coverUrl: 'https://example.com/alias-cover.jpg',
      intro: 'Alias Summary',
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
      '章节内容为空，请重试或切换书源'
    )
    expect(state.loadErrorDetails.value).toBe('content_empty')
  })

  it('accepts plain string chapter content payload', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)
    const chapter: Chapter = {
      title: '第一章',
      url: 'https://example.com/book/1/1',
      index: 0,
    }

    mockGetContent.mockResolvedValue({
      isSuccess: true,
      data: '这是直接返回的正文字符串',
    })

    const content = await helpers.fetchChapterContent(chapter)
    expect(content).toBe('这是直接返回的正文字符串')
  })

  it('accepts stringified json chapter content payload', async () => {
    const state = createReaderState()
    const helpers = createReaderActionHelpers(state)
    const chapter: Chapter = {
      title: '第一章',
      url: 'https://example.com/book/1/1',
      index: 0,
    }

    mockGetContent.mockResolvedValue({
      isSuccess: true,
      data: JSON.stringify({
        content: '这是 JSON 字符串里的正文',
        meta: {
          stageReports: [{ stage: 'decode', ok: true }],
        },
      }),
    })

    const content = await helpers.fetchChapterContent(chapter)
    expect(content).toBe('这是 JSON 字符串里的正文')
    expect(state.contentStageReports.value).toEqual([{ stage: 'decode', ok: true }])
  })

  it('normalizes stage_reports payload aliases and value shapes', async () => {
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
        content: '正文',
        stage_reports: [
          {
            stage: 'decode',
            ok: '0',
            failure_code: 'decode_failed',
            warnings: '["warn-1"]',
            metrics: '{"cost":"12"}',
          },
        ],
      },
    })

    const content = await helpers.fetchChapterContent(chapter)
    expect(content).toBe('正文')
    expect(state.contentStageReports.value).toEqual([
      {
        stage: 'decode',
        ok: false,
        failureCode: 'decode_failed',
        warnings: ['warn-1'],
        metrics: { cost: '12' },
      },
    ])
  })

  it('accepts meta.stage_reports in content payload', async () => {
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
        content: '正文',
        meta: {
          stage_reports: [{ stage: 'fetch', ok: true }],
        },
      },
    })

    const content = await helpers.fetchChapterContent(chapter)
    expect(content).toBe('正文')
    expect(state.contentStageReports.value).toEqual([{ stage: 'fetch', ok: true }])
  })

  it('accepts chunks-only chapter content payload', async () => {
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
        chunks: ['第一段', '第二段'],
      },
    })

    const content = await helpers.fetchChapterContent(chapter)
    expect(content).toBe('第一段\n第二段')
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
        })
      )
    )

    await expect(helpers.fetchChapterContent(chapter)).rejects.toThrow(
      '正文解析失败 (阶段: decode · 代码: decode_failed)'
    )
    expect(state.loadErrorDetails.value).toBe('阶段: decode · 代码: decode_failed')
  })
})
