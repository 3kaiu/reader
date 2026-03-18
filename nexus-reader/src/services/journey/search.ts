import { bookApi } from '@/api/book'
import { sourceApi } from '@/api/source'
import { $post } from '@/api/client'

export const searchJourneyService = {
  searchBooks: (keyword: string) => bookApi.search(keyword),
  getSources: () => sourceApi.getBookSources(),
  saveSource: (source: Partial<Record<string, unknown>>) =>
    sourceApi.addSource(source as Partial<any> & Record<string, unknown>),
  deleteSource: (id: string) => sourceApi.deleteBookSource(id),
  updateSourceStatus: (id: string, enabled: boolean) =>
    sourceApi.updateSourceStatus(id, enabled),
  // Legacy endpoints kept here so pages do not depend on transport details.
  saveSourcesBatch: (sources: unknown[]) => $post('/saveBookSources', sources),
  deleteSourcesBatch: (sources: unknown[]) => $post('/deleteBookSources', sources),
}
