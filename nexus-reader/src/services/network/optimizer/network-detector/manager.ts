import { getNavigatorConnection } from '../runtime'
import type { NetworkInfo, NetworkQuality } from '../types'
import { detectNetworkInfo, getFallbackNetworkInfo, hasNetworkChanged } from './info'
import { addNetworkListener, notifyNetworkListeners, removeNetworkListener } from './listeners'
import { getNetworkQualityFromInfo } from './quality'

export class NetworkDetector {
  private networkInfo: NetworkInfo | null = null
  private listeners: Array<(info: NetworkInfo) => void> = []
  private updateInterval: number | null = null

  constructor() {
    this.initNetworkDetection()
  }

  getNetworkInfo(): NetworkInfo {
    if (this.networkInfo) {
      return this.networkInfo
    }

    return getFallbackNetworkInfo()
  }

  isOnline(): boolean {
    return this.getNetworkInfo().isOnline
  }

  getNetworkQuality(): NetworkQuality {
    return getNetworkQualityFromInfo(this.getNetworkInfo())
  }

  addNetworkChangeListener(listener: (info: NetworkInfo) => void): void {
    addNetworkListener(this.listeners, listener)
  }

  removeNetworkChangeListener(listener: (info: NetworkInfo) => void): void {
    removeNetworkListener(this.listeners, listener)
  }

  startMonitoring(): void {
    // Event-driven monitoring - no polling needed
  }

  stopMonitoring(): void {
    if (this.updateInterval && typeof window !== 'undefined') {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
  }

  private initNetworkDetection(): void {
    this.networkInfo = detectNetworkInfo()

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnlineStatusChange.bind(this))
      window.addEventListener('offline', this.handleOnlineStatusChange.bind(this))

      const connection = getNavigatorConnection()
      if (connection && typeof connection.addEventListener === 'function') {
        connection.addEventListener('change', this.handleConnectionChange.bind(this))
      }
    }
  }

  private handleOnlineStatusChange(): void {
    const nextInfo = detectNetworkInfo()
    this.networkInfo = nextInfo
    notifyNetworkListeners(this.listeners, nextInfo)
  }

  private handleConnectionChange(): void {
    const nextInfo = detectNetworkInfo()
    if (hasNetworkChanged(this.networkInfo, nextInfo)) {
      this.networkInfo = nextInfo
      notifyNetworkListeners(this.listeners, nextInfo)
    }
  }
}
