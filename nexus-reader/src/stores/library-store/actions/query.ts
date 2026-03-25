import type { Book } from '@/types/book'
import type { LibraryStoreState, LibraryStoreView } from '../types'

export function createLibraryQueryActions(
  state: LibraryStoreState,
  view: LibraryStoreView,
) {
  function hasBook(bookUrl: string): boolean {
    return view.bookUrls.value.has(bookUrl)
  }

  function findBookByUrl(bookUrl: string): Book | undefined {
    return state.books.value.find(book => book.bookUrl === bookUrl)
  }

  function getBooksByIds(ids: Iterable<string>): Book[] {
    const targetIds = new Set(Array.from(ids).filter(Boolean))
    if (targetIds.size === 0) {
      return []
    }

    return state.books.value.filter(book => book.id && targetIds.has(book.id))
  }

  return {
    hasBook,
    findBookByUrl,
    getBooksByIds,
  }
}
