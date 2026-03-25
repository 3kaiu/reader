import { logger } from '@/utils/logger'
import { getPerformanceMonitor } from './runtime'
import type { NetworkDetector } from './networkDetector'

export function initializeNetworkOptimizer(networkDetector: NetworkDetector): void {
  if (typeof window === 'undefined') {
    return
  }

  networkDetector.startMonitoring()

  window.addEventListener('beforeunload', () => {
    networkDetector.stopMonitoring()
  })

  networkDetector.addNetworkChangeListener(info => {
    logger.debug('Network changed:', info)

    const performanceMonitor = getPerformanceMonitor()
    if (!performanceMonitor) {
      return
    }

    performanceMonitor.reportMetric('network_change', 1, {
      effectiveType: info.effectiveType,
      downlink: info.downlink,
      rtt: info.rtt,
      saveData: info.saveData,
      isOnline: info.isOnline,
    })
  })
}
