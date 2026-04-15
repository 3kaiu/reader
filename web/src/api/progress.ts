import { $delete, $get, $put } from './client'
import type { ApiResponse } from './http/types'

export type ProgressRecord = {
  bookId: string
  chapterIndex: number
  scrollPercent: number
  scrollKind?: 'chapter' | 'document'
  /** Server-side timestamp alias (equals `updatedAt` from Worker). */
  serverUpdatedAt?: number
  updatedAt: number
  lastRequestId?: string
}

export type ProgressWritePayload = Partial<
  Pick<ProgressRecord, 'chapterIndex' | 'scrollPercent' | 'scrollKind' | 'updatedAt'>
>

export type ProgressWriteResult = {
  success: true
  duplicate?: boolean
  ignored?: boolean
  progress?: ProgressRecord
}

function normalizeProgressRecord(record: ProgressRecord): ProgressRecord {
  if (typeof record.serverUpdatedAt === 'number' && Number.isFinite(record.serverUpdatedAt)) {
    return record
  }
  if (typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)) {
    return {
      ...record,
      serverUpdatedAt: record.updatedAt,
    }
  }
  return record
}

function normalizeProgressResponse<T extends ProgressRecord>(
  response: ApiResponse<T>
): ApiResponse<T> {
  if (!response.isSuccess || !response.data) return response
  return {
    ...response,
    data: normalizeProgressRecord(response.data) as T,
  }
}

function normalizeProgressWriteResult(
  response: ApiResponse<ProgressWriteResult>
): ApiResponse<ProgressWriteResult> {
  if (!response.isSuccess || !response.data) return response
  const progress = response.data.progress
  return {
    ...response,
    data: {
      ...response.data,
      ...(progress ? { progress: normalizeProgressRecord(progress) } : {}),
    },
  }
}

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
    return $get<ProgressRecord>(`/progress/${encodeURIComponent(bookId)}`, { silent: true }).then(
      normalizeProgressResponse
    )
  },
  put: (bookId: string, payload: ProgressWritePayload) => {
    if (typeof location === 'undefined' || typeof location.origin !== 'string') {
      return Promise.resolve({
        isSuccess: false,
        data: null as unknown as ProgressWriteResult,
        errorMsg: 'Progress API unavailable in this environment',
      })
    }
    return $put<ProgressWriteResult>(
      `/progress/${encodeURIComponent(bookId)}`,
      payload,
      { silent: true }
    ).then(normalizeProgressWriteResult)
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

