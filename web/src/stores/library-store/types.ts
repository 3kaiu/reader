import type { ComputedRef, Ref } from 'vue'
import type { ApiResponse } from '@/api/http/types'
import type { SaveBookInput } from '@/api/library'
import type { Book } from '@/types/book'
import type { BookGroup } from '@/types/group'

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

export interface LibraryStoreState {
  books: Ref<Book[]>
  groups: Ref<BookGroup[]>
  booksLoaded: Ref<boolean>
  groupsLoaded: Ref<boolean>
  loadingBooks: Ref<boolean>
  loadingGroups: Ref<boolean>
}

export interface LibraryStoreView {
  bookUrls: ComputedRef<Set<string>>
  isInitialLoading: ComputedRef<boolean>
}

export interface LibraryStoreActions {
  loadBooks(force?: boolean): Promise<ApiResponse<Book[]>>
  loadGroups(force?: boolean): Promise<ApiResponse<BookGroup[]>>
  hydrate(force?: boolean): Promise<void>
  hasBook(bookUrl: string): boolean
  findBookByUrl(bookUrl: string): Book | undefined
  getBooksByIds(ids: Iterable<string>): Book[]
  addBook(book: SaveBookInput | Book): Promise<ApiResponse<Book>>
  ensureBook(book: SaveBookInput | Book): Promise<EnsureBookResult>
  deleteBookIds(ids: Iterable<string>): Promise<DeleteBooksResult>
  moveBookIdsToGroup(groupId: string | null, ids: Iterable<string>): Promise<ApiResponse<void>>
}
