import { bookApi } from '@/api/book'
import type { Book } from '@/api/book'
import { groupApi, type BookGroup } from '@/api/group'
import { manageApi } from '@/api/manage'
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
  moveBooksToGroup: (groupId: string | null, books: Book[]) =>
    manageApi.addBookGroupMulti(groupId, books),
  saveProgress: (id: string, chapterIndex: number, position: number) =>
    bookApi.saveBookProgress(id, chapterIndex, position),
  listGroups: () => groupApi.getBookGroups(),
  saveGroup: (group: Partial<BookGroup>) => groupApi.saveBookGroup(group),
  deleteGroup: (groupId: string | number) => groupApi.deleteBookGroup(groupId),
  listReplaceRules: () => replaceApi.getReplaceRules(),
}
