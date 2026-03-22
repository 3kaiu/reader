import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ApiResponse } from '@/api/http/types'
import { libraryApi, type SaveBookInput } from '@/api/library'
import type { Book } from '@/types/book'
import type { BookGroup } from '@/types/group'
import {
  buildDeleteBatchSummary,
  collectSettledSuccessIds,
  getSettledApiError,
  normalizeBatchIds,
} from '@/utils/batchMutation'
import {
  isConflictError,
  isSameBook,
  mergeSavedBook,
  toSaveBookInput,
} from '@/utils/libraryStore'

export type EnsureBookResult = {
  status: 'added' | 'existing' | 'failed'
  book?: Book
  errorMsg?: string
}

export type DeleteBooksResult = {
  status: 'deleted' | 'partial' | 'failed'
  deletedCount: number
  failedCount: number
  deletedIds: string[]
  remainingIds: string[]
  errorMsg?: string
}

export const useLibraryStore = defineStore('library', () => {
  const books = ref<Book[]>([])
  const groups = ref<BookGroup[]>([])
  const booksLoaded = ref(false)
  const groupsLoaded = ref(false)
  const loadingBooks = ref(false)
  const loadingGroups = ref(false)

  let booksLoadPromise: Promise<ApiResponse<Book[]>> | null = null
  let groupsLoadPromise: Promise<ApiResponse<BookGroup[]>> | null = null

  const bookUrls = computed(() => new Set(books.value.map(book => book.bookUrl)))
  const isInitialLoading = computed(
    () => (!booksLoaded.value || !groupsLoaded.value) && (loadingBooks.value || loadingGroups.value)
  )

  function upsertBook(book: Book): void {
    const index = books.value.findIndex(existing => isSameBook(existing, book))
    if (index === -1) {
      books.value = [book, ...books.value]
      return
    }

    const nextBooks = [...books.value]
    nextBooks[index] = {
      ...nextBooks[index],
      ...book,
    }
    books.value = nextBooks
  }

  async function loadBooks(force = false): Promise<ApiResponse<Book[]>> {
    if (booksLoadPromise) {
      return booksLoadPromise
    }

    if (booksLoaded.value && !force) {
      return {
        isSuccess: true,
        data: books.value,
      }
    }

    loadingBooks.value = true
    booksLoadPromise = libraryApi
      .listBooks()
      .then(response => {
        books.value = response.isSuccess && Array.isArray(response.data) ? response.data : []
        booksLoaded.value = true
        return response
      })
      .finally(() => {
        loadingBooks.value = false
        booksLoadPromise = null
      })

    return booksLoadPromise
  }

  async function loadGroups(force = false): Promise<ApiResponse<BookGroup[]>> {
    if (groupsLoadPromise) {
      return groupsLoadPromise
    }

    if (groupsLoaded.value && !force) {
      return {
        isSuccess: true,
        data: groups.value,
      }
    }

    loadingGroups.value = true
    groupsLoadPromise = libraryApi
      .listGroups()
      .then(response => {
        groups.value = response.isSuccess && Array.isArray(response.data) ? response.data : []
        groupsLoaded.value = true
        return response
      })
      .finally(() => {
        loadingGroups.value = false
        groupsLoadPromise = null
      })

    return groupsLoadPromise
  }

  async function hydrate(force = false): Promise<void> {
    await Promise.all([loadBooks(force), loadGroups(force)])
  }

  function hasBook(bookUrl: string): boolean {
    return bookUrls.value.has(bookUrl)
  }

  function findBookByUrl(bookUrl: string): Book | undefined {
    return books.value.find(book => book.bookUrl === bookUrl)
  }

  function getBooksByIds(ids: Iterable<string>): Book[] {
    const targetIds = new Set(Array.from(ids).filter(Boolean))
    if (targetIds.size === 0) {
      return []
    }

    return books.value.filter(book => book.id && targetIds.has(book.id))
  }

  async function addBook(book: SaveBookInput | Book): Promise<ApiResponse<Book>> {
    const response = await libraryApi.saveBook(toSaveBookInput(book))
    if (response.isSuccess) {
      upsertBook(mergeSavedBook(book, response.data))
    }
    return response
  }

  async function ensureBook(book: SaveBookInput | Book): Promise<EnsureBookResult> {
    const existingBook = findBookByUrl(book.bookUrl)
    if (existingBook) {
      return {
        status: 'existing',
        book: existingBook,
      }
    }

    try {
      const response = await addBook(book)
      if (response.isSuccess) {
        return {
          status: 'added',
          book: response.data || mergeSavedBook(book),
        }
      }

      return {
        status: 'failed',
        errorMsg: response.errorMsg || '加入书架失败',
      }
    } catch (error) {
      if (isConflictError(error)) {
        await loadBooks(true)
        return {
          status: 'existing',
          book: findBookByUrl(book.bookUrl),
        }
      }

      throw error
    }
  }

  async function deleteBooks(ids: string[]): Promise<ApiResponse<string[]>> {
    const targetIds = normalizeBatchIds(ids)

    if (targetIds.length === 0) {
      return {
        isSuccess: true,
        data: [],
      }
    }

    const results = await Promise.allSettled(
      targetIds.map(id => libraryApi.deleteBook(id))
    )

    const deletedIds = collectSettledSuccessIds(targetIds, results)

    if (deletedIds.length > 0) {
      const deletedIdSet = new Set(deletedIds)
      books.value = books.value.filter(book => !book.id || !deletedIdSet.has(book.id))
    }

    return {
      isSuccess: deletedIds.length === targetIds.length,
      data: deletedIds,
      errorMsg: getSettledApiError(results, '部分书籍删除失败'),
    }
  }

  async function deleteBookIds(ids: Iterable<string>): Promise<DeleteBooksResult> {
    const targetIds = normalizeBatchIds(ids)
    const response = await deleteBooks(targetIds)
    return buildDeleteBatchSummary(targetIds, response.data || [], response.errorMsg)
  }

  async function moveBooksToGroup(
    groupId: string | null,
    selectedBooks: Book[]
  ): Promise<ApiResponse<void>> {
    const response = await libraryApi.moveBooksToGroup(groupId, selectedBooks)
    if (response.isSuccess) {
      const targetIds = new Set(
        selectedBooks
          .map(book => book.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )

      books.value = books.value.map(book =>
        book.id && targetIds.has(book.id)
          ? {
              ...book,
              groupId: groupId ?? undefined,
            }
          : book
      )
    }
    return response
  }

  async function moveBookIdsToGroup(
    groupId: string | null,
    ids: Iterable<string>
  ): Promise<ApiResponse<void>> {
    const selectedBooks = getBooksByIds(ids)
    if (selectedBooks.length === 0) {
      return {
        isSuccess: true,
        data: undefined,
      }
    }

    return await moveBooksToGroup(groupId, selectedBooks)
  }

  return {
    books,
    groups,
    booksLoaded,
    groupsLoaded,
    loadingBooks,
    loadingGroups,
    isInitialLoading,
    bookUrls,
    loadBooks,
    loadGroups,
    hydrate,
    hasBook,
    findBookByUrl,
    getBooksByIds,
    addBook,
    ensureBook,
    deleteBookIds,
    moveBookIdsToGroup,
  }
})
