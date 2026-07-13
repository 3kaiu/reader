import { $delete, $get, $post, $put } from './client'
import type { Book } from '@/types/book'
import { groupApi } from './group'

export interface SaveBookInput {
  sourceId: string
  bookUrl: string
  name: string
  author?: string
  coverUrl?: string
  intro?: string
}

export const libraryApi = {
  listBooks: () => $get<Book[]>('/bookshelf'),
  saveBook: (book: SaveBookInput) =>
    $post<Book>('/bookshelf', {
      source_id: book.sourceId,
      book_url: book.bookUrl,
      name: book.name,
      author: book.author,
      cover_url: book.coverUrl,
      intro: book.intro,
    }),
  deleteBook: (id: string) => $delete(`/bookshelf/${id}`),
  moveBookToGroup: (id: string, groupId: string | null) =>
    $put(`/bookshelf/${id}`, { group_id: groupId }),
  moveBooksToGroup: async (groupId: string | null, books: Book[]) => {
    const targets = books.filter((book): book is Book & { id: string } => Boolean(book.id))
    const results = await Promise.all(
      targets.map(book => $put(`/bookshelf/${book.id}`, { group_id: groupId }))
    )

    return {
      isSuccess: results.every(result => result.isSuccess),
      data: undefined,
      errorMsg: results.find(result => !result.isSuccess)?.errorMsg,
    }
  },
  listGroups: () => groupApi.getBookGroups(),
}
