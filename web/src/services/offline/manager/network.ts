import { OfflineStatusTracker } from '../statusTracker'

export function setupOfflineDetection(options: {
  statusTracker: OfflineStatusTracker
  onReconnect: () => Promise<void>
  onStatusChange: () => void
  onError: (error: unknown) => void
}): void {
  const handleStatusChange = () => {
    const isOnline = navigator.onLine
    const transition = options.statusTracker.updateConnection(isOnline)

    if (transition.becameOnline) {
      setTimeout(() => {
        options.onReconnect().catch(options.onError)
      }, 1000)
    }

    options.onStatusChange()
  }

  window.addEventListener('online', handleStatusChange)
  window.addEventListener('offline', handleStatusChange)

  options.statusTracker.setInitialOnlineState(navigator.onLine)
}
