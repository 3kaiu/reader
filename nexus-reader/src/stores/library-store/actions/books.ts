import type { SaveBookInput } from '@/api/library'
import { libraryApi } from '@/api/library'
import type { ApiResponse } from '@/api/http/types'
import type { Book } from '@/types/book'
import {
  buildDeleteBatchSummary,
  collectSettledSuccessIds,
  getSettledApiError,
  normalizeBatchIds,
} from '@/utils/batchMutation'
import { isConflictError, mergeSavedBook, toSaveBookInput } from '@/utils/libraryStore'
import type { DeleteBooksResult, EnsureBookResult } from '../types'

interface LibraryBookHelpers {
  books: () => Book[]
  setBooks: (nextBooks: Book[]) => void
  upsertBook: (book: Book) => void
  findBookByUrl: (bookUrl: string) => Book | undefined
  getBooksByIds: (ids: Iterable<string>) => Book[]
  loadBooks: (force?: boolean) => Promise<ApiResponse<Book[]>>
}

export function createLibraryBookActions(helpers: LibraryBookHelpers) {
  async function addBook(book: SaveBookInput | Book): Promise<ApiResponse<Book>> {
    const response = await libraryApi.saveBook(toSaveBookInput(book))
    if (response.isSuccess) {
      helpers.upsertBook(mergeSavedBook(book, response.data))
    }
    return response
  }

  async function ensureBook(book: SaveBookInput | Book): Promise<EnsureBookResult> {
    const existingBook = helpers.findBookByUrl(book.bookUrl)
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
        await helpers.loadBooks(true)
        return {
          status: 'existing',
          book: helpers.findBookByUrl(book.bookUrl),
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

    const results = await Promise.allSettled(targetIds.map(id => libraryApi.deleteBook(id)))

    const deletedIds = collectSettledSuccessIds(targetIds, results)

    if (deletedIds.length > 0) {
      const deletedIdSet = new Set(deletedIds)
      helpers.setBooks(helpers.books().filter(book => !book.id || !deletedIdSet.has(book.id)))
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

      helpers.setBooks(
        helpers.books().map(book =>
          book.id && targetIds.has(book.id)
            ? {
                ...book,
                groupId: groupId ?? undefined,
              }
            : book
        )
      )
    }
    return response
  }

  async function moveBookIdsToGroup(
    groupId: string | null,
    ids: Iterable<string>
  ): Promise<ApiResponse<void>> {
    const selectedBooks = helpers.getBooksByIds(ids)
    if (selectedBooks.length === 0) {
      return {
        isSuccess: true,
        data: undefined,
      }
    }

    return await moveBooksToGroup(groupId, selectedBooks)
  }

  return {
    addBook,
    ensureBook,
    deleteBookIds,
    moveBookIdsToGroup,
  }
}
