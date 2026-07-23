import { logger } from '../../../utils/logger'
import type { OfflineStatus } from '../types'
import type { OfflineManager } from './runtime'

type PerformanceMonitorLike = {
  reportMetric: (name: string, value: number, context?: Record<string, unknown>) => void
}

/**
 * Bootstraps the offline manager: starts auto-sync, schedules periodic cleanup,
 * registers a beforeunload hook and a status listener. Returns a cleanup function
 * that stops the auto-sync timer, clears the periodic interval, removes the
 * beforeunload listener and unsubscribes the status listener. Call it on teardown
 * to avoid leaking intervals and listeners.
 */
export function bootstrapOfflineManager(offlineManager: OfflineManager): () => void {
  offlineManager.startAutoSync()

  const cleanupInterval = setInterval(
    () => {
      offlineManager.cleanupExpiredContent()
    },
    60 * 60 * 1000
  )

  const beforeUnloadHandler = () => {
    offlineManager.stopAutoSync()
  }
  window.addEventListener('beforeunload', beforeUnloadHandler)

  const statusListener = (status: OfflineStatus) => {
    logger.info('Offline status changed', status)

    const performanceMonitor = (
      window as Window & {
        performanceMonitor?: PerformanceMonitorLike
      }
    ).performanceMonitor

    if (performanceMonitor) {
      performanceMonitor.reportMetric('offline_status', status.isOnline ? 1 : 0, {
        queuedOperations: status.queuedOperations,
        cachedContent: status.cachedContent,
        offlineDuration: status.offlineDuration,
      })
    }
  }
  offlineManager.addStatusListener(statusListener)

  return () => {
    offlineManager.stopAutoSync()
    clearInterval(cleanupInterval)
    window.removeEventListener('beforeunload', beforeUnloadHandler)
    offlineManager.removeStatusListener(statusListener)
  }
}
