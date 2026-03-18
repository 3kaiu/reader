/**
 * 管理相关 API
 */
import { bookApi } from './book'
import type { ApiResponse } from './client'
import type { Book } from './book'

export const manageApi = {
  /**
   * 批量移动书籍到分组
   */
  addBookGroupMulti: async (groupId: string | null, books: Book[]) => {
    const targets = books.filter((book): book is Book & { id: string } => Boolean(book.id))
    await Promise.all(targets.map(book => bookApi.moveToGroup(book.id, groupId)))
    return {
      isSuccess: true,
      data: undefined,
    } as ApiResponse<void>
  },
}
