import { bookApi } from '@/api/book'
import type { Book } from '@/api/book'
import { groupApi, type BookGroup } from '@/api/group'
import { replaceApi } from '@/api/replace'

export const bookshelfJourneyService = {
  listBooks: () => bookApi.getBookshelf(),
  saveBook: (book: {
    sourceId: string
    bookUrl: string
    name: string
    author?: string
    coverUrl?: string
    intro?: string
  }) => bookApi.saveBook(book),
  deleteBook: (id: string) => bookApi.deleteBook(id),
  moveBookToGroup: (id: string, groupId: string | null) => bookApi.moveToGroup(id, groupId),
  moveBooksToGroup: async (groupId: string | null, books: Book[]) => {
    const targets = books.filter((book): book is Book & { id: string } => Boolean(book.id))
    const results = await Promise.all(targets.map(book => bookApi.moveToGroup(book.id, groupId)))

    return {
      isSuccess: results.every(result => result.isSuccess),
      data: undefined,
      errorMsg: results.find(result => !result.isSuccess)?.errorMsg,
    }
  },
  listGroups: () => groupApi.getBookGroups(),
  listReplaceRules: () => replaceApi.getReplaceRules(),
}
