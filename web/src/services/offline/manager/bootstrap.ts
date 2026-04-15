import { logger } from '../../../utils/logger'
import type { OfflineManager } from './runtime'

type PerformanceMonitorLike = {
  reportMetric: (name: string, value: number, context?: Record<string, unknown>) => void
}

export function bootstrapOfflineManager(offlineManager: OfflineManager): void {
  offlineManager.startAutoSync()

  setInterval(
    () => {
      offlineManager.cleanupExpiredContent()
    },
    60 * 60 * 1000
  )

  window.addEventListener('beforeunload', () => {
    offlineManager.stopAutoSync()
  })

  offlineManager.addStatusListener(status => {
    logger.info('Offline status changed', status)

    const performanceMonitor = (window as Window & {
      performanceMonitor?: PerformanceMonitorLike
    }).performanceMonitor

    if (performanceMonitor) {
      performanceMonitor.reportMetric('offline_status', status.isOnline ? 1 : 0, {
        queuedOperations: status.queuedOperations,
        cachedContent: status.cachedContent,
        offlineDuration: status.offlineDuration,
      })
    }
  })
}
