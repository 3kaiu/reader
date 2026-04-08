import {
  getLocalStorageItem,
  setLocalStorageItem,
} from '@/utils/browserStorage'
import type { Book, Chapter } from '@/types/book'

const PROGRESS_STORAGE_KEY = 'reader-progress'
const MAX_LOADED_SCROLL_CHAPTERS = 180

export type ReaderLoadedChapter = {
  index: number
  title: string
  formattedContent?: string
}

export type ReaderBook = Book & {
  sourceId: string
  bookUrl: string
  tags?: string[]
}

function sanitizeCacheSegment(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
  return normalized.replace(/^_+|_+$/g, '') || 'source'
}

function hashCacheKey(value: string): string {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

export function buildReaderContentBookId(
  book: Pick<ReaderBook, 'id' | 'sourceId' | 'bookUrl'>
): string {
  if (book.id) {
    return `shelf_${sanitizeCacheSegment(book.id)}`
  }

  return `source_${sanitizeCacheSegment(book.sourceId)}_${hashCacheKey(book.bookUrl)}`
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatReaderContent(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return ''
  }

  return normalized
    .split(/\n{2,}/)
    .map(paragraph => {
      const line = escapeHtml(paragraph.trim()).replace(/\n/g, '<br />')
      return `<p class="content-paragraph">${line}</p>`
    })
    .join('')
}

export function loadPersistedReaderProgress(): Record<string, number> {
  try {
    const raw = getLocalStorageItem(PROGRESS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function savePersistedReaderProgress(
  progressMap: Record<string, number>
): void {
  try {
    setLocalStorageItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressMap))
  } catch {
    // ignore persist failures
  }
}

export function normalizeReaderCatalog(chapters: Chapter[]): Chapter[] {
  return chapters.map((chapter, index) => ({
    ...chapter,
    index: typeof chapter.index === 'number' ? chapter.index : index,
  }))
}

export function createLoadedChapter(
  chapter: Chapter,
  chapterContent: string
): ReaderLoadedChapter {
  return {
    index: chapter.index,
    title: chapter.title,
    formattedContent: formatReaderContent(chapterContent),
  }
}

export function mergeLoadedChapters(
  chapters: ReaderLoadedChapter[],
  nextEntry: ReaderLoadedChapter,
  replaceOnly = false
): ReaderLoadedChapter[] {
  if (replaceOnly) {
    return [nextEntry]
  }

  const existingIndex = chapters.findIndex(chapter => chapter.index === nextEntry.index)
  if (existingIndex >= 0) {
    const next = [...chapters]
    next[existingIndex] = nextEntry
    return next
  }

  const merged = [...chapters, nextEntry].sort((a, b) => a.index - b.index)
  if (merged.length <= MAX_LOADED_SCROLL_CHAPTERS) {
    return merged
  }

  // Keep a bounded sliding window for long-scroll sessions to cap memory growth.
  return merged.slice(-MAX_LOADED_SCROLL_CHAPTERS)
}

export function resolveInitialChapterIndex(options: {
  catalogLength: number
  persistedIndex?: number
  bookLastChapterIndex?: number
  bookDurChapterIndex?: number
}): number {
  return Math.max(
    0,
    Math.min(
      typeof options.persistedIndex === 'number'
        ? options.persistedIndex
        : options.bookLastChapterIndex || options.bookDurChapterIndex || 0,
      Math.max(options.catalogLength - 1, 0)
    )
  )
}
