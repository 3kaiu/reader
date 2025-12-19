import { $post } from './client'
import type { Book } from './book'

export const exploreApi = {
    // Get books for a specific explore rule
    exploreBook: (params: { ruleFindUrl: string; bookSourceUrl: string; page: number }) =>
        $post<Book[]>('/exploreBook', params)
}
