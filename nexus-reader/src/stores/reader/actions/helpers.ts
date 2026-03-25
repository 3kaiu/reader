import type { ApiResponse } from '@/api/http/types'
import { readerApi } from '@/api/reader'
import type { Chapter } from '@/types/book'
import { isSameReaderRouteTarget } from '@/utils/readerRoute'
import {
  createLoadedChapter,
  formatReaderContent,
  mergeLoadedChapters,
  normalizeReaderCatalog,
  type ReaderBook,
} from '@/utils/readerStore'
import type { ReaderStoreState, ReaderTarget } from '../types'

export function createReaderActionHelpers(state: ReaderStoreState) {
  const cacheChapterContent = (chapterUrl: string, chapterContent: string) => {
    state.chapterContentCache.value = {
      ...state.chapterContentCache.value,
      [chapterUrl]: chapterContent,
    }
  }

  const getCachedChapterContent = (chapterUrl: string) =>
    state.chapterContentCache.value[chapterUrl]

  const fetchBookInfo = async (
    sourceId: string,
    bookUrl: string,
  ): Promise<ApiResponse<ReaderBook>> => {
    const response = await readerApi.getBookInfo(sourceId, bookUrl)

    if (!response.isSuccess || !response.data) {
      return response as ApiResponse<ReaderBook>
    }

    return {
      ...response,
      data: {
        ...response.data,
        sourceId,
        bookUrl,
      },
    }
  }

  const isCurrentBookTarget = (target: ReaderTarget) =>
    Boolean(
      state.currentBook.value &&
        isSameReaderRouteTarget(state.currentBook.value, target),
    )

  const hasActiveSession = (target: ReaderTarget) =>
    isCurrentBookTarget(target) &&
    state.catalog.value.length > 0 &&
    state.currentChapter.value !== null

  const ensureCatalog = async () => {
    if (!state.currentBook.value) {
      throw new Error('缺少书籍信息')
    }

    if (state.catalog.value.length > 0) {
      return state.catalog.value
    }

    const res = await readerApi.getChapters(
      state.currentBook.value.sourceId,
      state.currentBook.value.bookUrl,
    )

    if (!res.isSuccess || !Array.isArray(res.data)) {
      throw new Error(res.errorMsg || '获取目录失败')
    }

    state.catalog.value = normalizeReaderCatalog(res.data)

    return state.catalog.value
  }

  const setCurrentChapterContent = (chapter: Chapter, chapterContent: string) => {
    state.currentChapter.value = chapter
    state.content.value = chapterContent
    state.isParsing.value = true
    state.formattedContent.value = formatReaderContent(chapterContent)
    state.isParsing.value = false
  }

  const updateLoadedChapter = (
    chapter: Chapter,
    chapterContent: string,
    replaceOnly = false,
  ) => {
    state.loadedChapters.value = mergeLoadedChapters(
      state.loadedChapters.value,
      createLoadedChapter(chapter, chapterContent),
      replaceOnly,
    )
  }

  const fetchChapterContent = async (chapter: Chapter): Promise<string> => {
    const cached = getCachedChapterContent(chapter.url)
    if (typeof cached === 'string') {
      return cached
    }

    if (!state.currentBook.value) {
      throw new Error('缺少书籍信息')
    }

    const res = await readerApi.getContent(
      state.currentBook.value.sourceId,
      chapter.url,
      state.currentBook.value.bookUrl,
    )

    if (!res.isSuccess) {
      throw new Error(res.errorMsg || '获取正文失败')
    }

    const chapterContent = res.data?.content || ''
    cacheChapterContent(chapter.url, chapterContent)
    return chapterContent
  }

  const loadChapterAt = async (
    index: number,
    options: { replaceLoaded?: boolean } = {},
  ) => {
    const chapters = await ensureCatalog()
    const target = chapters[index]

    if (!target) {
      throw new Error('章节不存在')
    }

    const chapterContent = await fetchChapterContent(target)
    state.currentChapterIndex.value = index
    setCurrentChapterContent(target, chapterContent)
    updateLoadedChapter(target, chapterContent, options.replaceLoaded ?? true)
    state.loadError.value = null
  }

  return {
    fetchBookInfo,
    isCurrentBookTarget,
    hasActiveSession,
    ensureCatalog,
    setCurrentChapterContent,
    updateLoadedChapter,
    fetchChapterContent,
    loadChapterAt,
  }
}
