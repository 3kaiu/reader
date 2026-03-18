import { bookApi } from '@/api/book'

export const readingJourneyService = {
  getBookInfo: (source: string, url: string) => bookApi.getBookInfo(source, url),
  getChapters: (source: string, url: string) => bookApi.getChapterList(source, url),
  getContent: (source: string, url: string) => bookApi.getBookContent(source, url),
}
