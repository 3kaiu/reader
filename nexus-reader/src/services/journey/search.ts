import { bookApi } from '@/api/book'
import { sourceApi } from '@/api/source'

export const searchJourneyService = {
  searchBooks: (keyword: string) => bookApi.search(keyword),
  getSources: () => sourceApi.getBookSources(),
}
