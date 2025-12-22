import { $post } from './client'
import type { Book } from './book'

export const manageApi = {
    // Batch delete books
    deleteBooks: (books: Book[]) => $post('/deleteBooks', books),

    // Add books to group
    addBookGroupMulti: (groupId: number, bookList: Book[]) =>
        $post('/addBookGroupMulti', { groupId, bookList }),

    // Remove books from group
    removeBookGroupMulti: (groupId: number, bookList: Book[]) =>
        $post('/removeBookGroupMulti', { groupId, bookList })
}
