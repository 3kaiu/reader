import type { JsonObject, R2ObjectLike, WorkerQueueMessage } from '../../shared/types.ts'

export interface UserActionProperties extends JsonObject {
  category?: string
  targetId?: string
  bookId?: string
  targetType?: string
  ip?: string
  userAgent?: string
  url?: string
}

export type UserStatsRow = Record<string, unknown> & {
  total_events?: number
  active_days?: number
  last_activity?: string | null
}

export interface PerformanceMetrics {
  endpoint?: string
  responseTime?: number
  statusCode?: number
}

export type PopularContentRow = Record<string, unknown> & {
  book_id?: string | null
  views?: number
}

export type {
  JsonObject,
  R2ObjectLike,
  WorkerQueueMessage,
}
