import type { Book } from '@/types/book'
import type { BookGroup } from '@/types/group'

export type BookshelfBook = Book & {
  sourceCount: number
  cachePercent: number
  isFullyCached: boolean
}

export type DeduplicatedBook = {
  book: Book
  sourceCount: number
}

export function deduplicateBooks(books: readonly Book[]): DeduplicatedBook[] {
  const bookMap = new Map<string, DeduplicatedBook>()

  for (const book of books) {
    const key = `${book.name}||${book.author || ''}`
    const existing = bookMap.get(key)

    if (!existing) {
      bookMap.set(key, { book, sourceCount: 1 })
      continue
    }

    existing.sourceCount += 1
    if ((book.lastReadTime || 0) > (existing.book.lastReadTime || 0)) {
      existing.book = book
    }
  }

  return Array.from(bookMap.values())
}

export function filterNonEmptyGroups(
  groups: readonly BookGroup[],
  books: readonly Book[]
): BookGroup[] {
  const bookGroupIds = new Set(
    books
      .map(book => (book.groupId == null ? '' : String(book.groupId)))
      .filter(Boolean)
  )
  return groups.filter(group => bookGroupIds.has(String(group.groupId)))
}

export function sortBooksByLastRead<T extends { lastReadTime?: number }>(
  books: readonly T[]
): T[] {
  return [...books].sort((left, right) => (right.lastReadTime || 0) - (left.lastReadTime || 0))
}

export function getBookshelfColumnsPerRow(width: number): number {
  if (width >= 1280) return 6
  if (width >= 1024) return 5
  if (width >= 768) return 4
  if (width >= 480) return 3
  return 2
}
