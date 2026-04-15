import type { SyncPriority } from './types'

export const PRIORITY_SCORE: Record<SyncPriority, number> = {
  CRITICAL: 0,
  NORMAL: 1,
  IDLE: 2,
}

export const RETRY_LIMITS: Record<SyncPriority, number> = {
  CRITICAL: 5,
  NORMAL: 3,
  IDLE: 1,
}

export function createSyncTaskId(): string {
  return `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function resolveSyncTaskPriority(
  priority: SyncPriority
): SyncPriority {
  // 个人工具不再根据电池状态动态调整优先级
  return priority
}
