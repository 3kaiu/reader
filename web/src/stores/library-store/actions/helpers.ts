import type { Book } from '@/types/book'
import type { BookGroup } from '@/types/group'
import { isSameBook } from '@/stores/library-store/helpers'
import type { LibraryStoreState } from '../types'

export function createLibraryActionHelpers(state: LibraryStoreState) {
  function setBooks(nextBooks: Book[]): void {
    state.books.value = nextBooks
  }

  function setGroups(nextGroups: BookGroup[]): void {
    state.groups.value = nextGroups
  }

  function markBooksLoaded(nextBooks: Book[]): void {
    state.books.value = nextBooks
    state.booksLoaded.value = true
  }

  function markGroupsLoaded(nextGroups: BookGroup[]): void {
    state.groups.value = nextGroups
    state.groupsLoaded.value = true
  }

  function upsertBook(book: Book): void {
    const index = state.books.value.findIndex(existing => isSameBook(existing, book))
    if (index === -1) {
      state.books.value = [book, ...state.books.value]
      return
    }

    const nextBooks = [...state.books.value]
    nextBooks[index] = {
      ...nextBooks[index],
      ...book,
    }
    state.books.value = nextBooks
  }

  return {
    setBooks,
    setGroups,
    markBooksLoaded,
    markGroupsLoaded,
    upsertBook,
  }
}
