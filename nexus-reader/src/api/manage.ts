/**
 * 管理相关 API
 */
import { $post } from './client'
import type { ApiResponse } from './client'
import type { Book } from './book'

export const manageApi = {
  /**
   * 批量移动书籍到分组
   */
  addBookGroupMulti: (groupId: string | null, books: Book[]) =>
    $post<void>('/bookshelf/batch-move', {
      groupId,
      bookIds: books.map(b => b.id).filter(Boolean)
    }) as Promise<ApiResponse<void>>,
}
