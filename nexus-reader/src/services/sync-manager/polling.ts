import { logger } from '../../utils/logger'
import { hardwareScheduler, PowerMode } from '../hardware/scheduler'
import { networkDetector } from '../network/optimizer'

export function getSyncQuota() {
  return hardwareScheduler.getQuota()
}

export function canProcessSyncQueue(isProcessing: boolean): boolean {
  return !isProcessing && networkDetector.isOnline()
}

export function shouldSkipSyncProcessing(hasCriticalTasks: boolean): boolean {
  const quota = getSyncQuota()

  if (quota.mode === PowerMode.ULTRA_LOW && !hasCriticalTasks) {
    logger.debug('[Sync] Skipping sync: Ultra low power mode and no critical tasks.')
    return true
  }

  return false
}

export function startSyncPolling(
  currentTimer: ReturnType<typeof setInterval> | null,
  onTick: () => Promise<void>,
): ReturnType<typeof setInterval> {
  if (currentTimer) {
    clearInterval(currentTimer)
  }

  const quota = getSyncQuota()
  logger.info(`[Sync] Starting polling with interval: ${quota.syncIntervalMs}ms (${quota.mode})`)

  return setInterval(() => {
    if (!networkDetector.isOnline()) {
      return
    }

    void onTick().catch(error => logger.error('[Sync] Polling error', { error }))
  }, quota.syncIntervalMs)
}

export function stopSyncPolling(
  currentTimer: ReturnType<typeof setInterval> | null,
): ReturnType<typeof setInterval> | null {
  if (currentTimer) {
    clearInterval(currentTimer)
  }

  return null
}
