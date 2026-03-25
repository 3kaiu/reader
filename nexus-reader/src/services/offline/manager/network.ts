import { networkDetector } from '../../network/optimizer'
import { OfflineStatusTracker } from '../statusTracker'

export function setupOfflineDetection(options: {
  statusTracker: OfflineStatusTracker
  onReconnect: () => Promise<void>
  onStatusChange: () => void
  onError: (error: unknown) => void
}): void {
  networkDetector.addNetworkChangeListener(info => {
    const transition = options.statusTracker.updateConnection(info.isOnline)

    if (transition.becameOnline) {
      setTimeout(() => {
        options.onReconnect().catch(options.onError)
      }, 1000)
    }

    options.onStatusChange()
  })

  options.statusTracker.setInitialOnlineState(networkDetector.getNetworkInfo().isOnline)
}
