import { OfflineStatusTracker } from '../statusTracker'

/**
 * Sets up online/offline detection. Returns a cleanup function that removes
 * the event listeners — call it when the owning context is torn down to avoid
 * leaking listeners (and keeping `options` closures alive).
 */
export function setupOfflineDetection(options: {
  statusTracker: OfflineStatusTracker
  onReconnect: () => Promise<void>
  onStatusChange: () => void
  onError: (error: unknown) => void
}): () => void {
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

  return () => {
    window.removeEventListener('online', handleStatusChange)
    window.removeEventListener('offline', handleStatusChange)
  }
}
