import { $delete, $get, $put } from './client'

export type ProgressRecord = {
  bookId: string
  chapterIndex: number
  scrollPercent: number
  scrollKind?: 'chapter' | 'document'
  updatedAt: number
  lastRequestId?: string
}

export type ProgressWritePayload = Partial<
  Pick<ProgressRecord, 'chapterIndex' | 'scrollPercent' | 'scrollKind' | 'updatedAt'>
>

export const progressApi = {
  get: (bookId: string) => {
    // Node/Vitest doesn't have a stable origin for relative fetches.
    if (typeof location === 'undefined' || typeof location.origin !== 'string') {
      return Promise.resolve({
        isSuccess: false,
        data: null as unknown as ProgressRecord,
        errorMsg: 'Progress API unavailable in this environment',
      })
    }
    return $get<ProgressRecord>(`/progress/${encodeURIComponent(bookId)}`, { silent: true })
  },
  put: (bookId: string, payload: ProgressWritePayload) => {
    if (typeof location === 'undefined' || typeof location.origin !== 'string') {
      return Promise.resolve({
        isSuccess: false,
        data: null as unknown as { success: true; duplicate?: boolean; ignored?: boolean },
        errorMsg: 'Progress API unavailable in this environment',
      })
    }
    return $put<{ success: true; duplicate?: boolean; ignored?: boolean }>(
      `/progress/${encodeURIComponent(bookId)}`,
      payload,
      { silent: true }
    )
  },
  delete: (bookId: string) => {
    if (typeof location === 'undefined' || typeof location.origin !== 'string') {
      return Promise.resolve({
        isSuccess: false,
        data: null as unknown as { success: true },
        errorMsg: 'Progress API unavailable in this environment',
      })
    }
    return $delete<{ success: true }>(`/progress/${encodeURIComponent(bookId)}`, { silent: true })
  },
}

