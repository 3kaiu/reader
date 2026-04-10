import type { ApiResponse } from '@/api/http/types'
import { libraryApi } from '@/api/library'
import type { Book } from '@/types/book'
import type { BookGroup } from '@/types/group'
import type { LibraryStoreState } from '../types'

interface LibraryLoadingHelpers {
  markBooksLoaded: (nextBooks: Book[]) => void
  markGroupsLoaded: (nextGroups: BookGroup[]) => void
}

export function createLibraryLoadingActions(
  state: LibraryStoreState,
  helpers: LibraryLoadingHelpers
) {
  let booksLoadPromise: Promise<ApiResponse<Book[]>> | null = null
  let groupsLoadPromise: Promise<ApiResponse<BookGroup[]>> | null = null

  async function loadBooks(force = false): Promise<ApiResponse<Book[]>> {
    if (booksLoadPromise) {
      return booksLoadPromise
    }

    if (state.booksLoaded.value && !force) {
      return {
        isSuccess: true,
        data: state.books.value,
      }
    }

    state.loadingBooks.value = true
    booksLoadPromise = libraryApi
      .listBooks()
      .then(response => {
        helpers.markBooksLoaded(
          response.isSuccess && Array.isArray(response.data) ? response.data : []
        )
        return response
      })
      .finally(() => {
        state.loadingBooks.value = false
        booksLoadPromise = null
      })

    return booksLoadPromise
  }

  async function loadGroups(force = false): Promise<ApiResponse<BookGroup[]>> {
    if (groupsLoadPromise) {
      return groupsLoadPromise
    }

    if (state.groupsLoaded.value && !force) {
      return {
        isSuccess: true,
        data: state.groups.value,
      }
    }

    state.loadingGroups.value = true
    groupsLoadPromise = libraryApi
      .listGroups()
      .then(response => {
        helpers.markGroupsLoaded(
          response.isSuccess && Array.isArray(response.data) ? response.data : []
        )
        return response
      })
      .finally(() => {
        state.loadingGroups.value = false
        groupsLoadPromise = null
      })

    return groupsLoadPromise
  }

  async function hydrate(force = false): Promise<void> {
    await Promise.all([loadBooks(force), loadGroups(force)])
  }

  return {
    loadBooks,
    loadGroups,
    hydrate,
  }
}
