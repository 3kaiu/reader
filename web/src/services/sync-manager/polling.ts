import { logger } from '../../utils/logger'

const DEFAULT_SYNC_QUOTA = {
  syncIntervalMs: 30000, // 30s
}

export function canProcessSyncQueue(isProcessing: boolean): boolean {
  return !isProcessing && (typeof navigator !== 'undefined' ? navigator.onLine : true)
}

export function shouldSkipSyncProcessing(_hasCriticalTasks: boolean): boolean {
  // 个人工具不再根据电池状态动态调整，始终尝试同步
  return false
}

export function startSyncPolling(
  currentTimer: ReturnType<typeof setInterval> | null,
  onTick: () => Promise<void>
): ReturnType<typeof setInterval> {
  if (currentTimer) {
    clearInterval(currentTimer)
  }

  const quota = DEFAULT_SYNC_QUOTA
  logger.info(`[Sync] Starting polling with interval: ${quota.syncIntervalMs}ms`)

  return setInterval(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return
    }

    void onTick().catch(error => logger.error('[Sync] Polling error', { error }))
  }, quota.syncIntervalMs)
}

export function stopSyncPolling(
  currentTimer: ReturnType<typeof setInterval> | null
): ReturnType<typeof setInterval> | null {
  if (currentTimer) {
    clearInterval(currentTimer)
  }

  return null
}
