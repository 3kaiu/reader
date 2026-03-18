import { $delete, $get, $post, $put } from '@/api/client'
import type { FetchOptions } from 'ofetch'

export interface ReadingProgressPayload {
  chapterIndex: number
  scrollPercent: number
}

const silentOptions = { silent: true } as unknown as FetchOptions

function progressPath(bookId: string): string {
  return `/progress/${encodeURIComponent(bookId)}`
}

export const syncJourneyService = {
  getUserPreferences: () => $get<Record<string, unknown>>('/preferences'),
  saveUserPreferences: (preferences: Record<string, unknown>) => $post('/preferences', preferences),
  createBackup: () => $post('/backup', {}),
  getClientRoutingAnalytics: <T = unknown>() =>
    $get<T>('/analytics/client-routing', { silent: true } as FetchOptions),
  reportClientMetrics: (metrics: unknown[]) =>
    $post('/metrics/client', { metrics }, silentOptions),
  getProgress: (bookId: string) => $get(progressPath(bookId)),
  saveProgress: (bookId: string, payload: ReadingProgressPayload) =>
    $put(progressPath(bookId), payload),
  clearProgress: (bookId: string) => $delete(progressPath(bookId)),
}
