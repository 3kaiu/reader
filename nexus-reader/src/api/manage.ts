import { bookApi, type Book } from './book'

export const manageApi = {
    // Batch delete books
    deleteBooks: async (books: Book[]) => {
        const results = await Promise.all(books.map(book => book.id ? bookApi.deleteBook(book.id) : Promise.resolve({ isSuccess: true })))
        return {
            isSuccess: results.every(r => r.isSuccess),
            data: results.map(r => r.data),
            errorMsg: results.find(r => !r.isSuccess)?.errorMsg
        }
    },

    // Add books to group
    addBookGroupMulti: async (groupId: string | number | null, bookList: Book[]) => {
        const results = await Promise.all(bookList.map(book => book.id ? bookApi.moveToGroup(book.id, groupId as string) : Promise.resolve({ isSuccess: true })))
        return {
            isSuccess: results.every(r => r.isSuccess),
            data: results.map(r => r.data),
            errorMsg: results.find(r => !r.isSuccess)?.errorMsg
        }
    }
}
