import { logger } from '../../../utils/logger'
import type { OfflineManager } from './runtime'

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

    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('offline_status', status.isOnline ? 1 : 0, {
        queuedOperations: status.queuedOperations,
        cachedContent: status.cachedContent,
        offlineDuration: status.offlineDuration,
      })
    }
  })
}
