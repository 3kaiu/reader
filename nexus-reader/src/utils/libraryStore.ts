import type { SaveBookInput } from '@/api/library'
import type { Book } from '@/types/book'

export function toSaveBookInput(book: SaveBookInput | Book): SaveBookInput {
  return {
    sourceId: book.sourceId,
    bookUrl: book.bookUrl,
    name: book.name,
    author: book.author,
    coverUrl: book.coverUrl,
    intro: book.intro,
  }
}

export function isSameBook(left: Book, right: Book): boolean {
  if (left.id && right.id) {
    return left.id === right.id
  }

  return left.sourceId === right.sourceId && left.bookUrl === right.bookUrl
}

export function mergeSavedBook(input: SaveBookInput | Book, saved?: Book): Book {
  return {
    ...toSaveBookInput(input),
    author: saved?.author ?? input.author ?? '',
    ...(saved || {}),
  }
}

export function isConflictError(error: unknown): boolean {
  return (
    (error instanceof Error && error.message.includes('409')) ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 409)
  )
}
