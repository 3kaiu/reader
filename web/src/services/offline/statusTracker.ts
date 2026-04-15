import type { OfflineStatus } from './types'

interface OfflineConnectionChange {
  becameOnline: boolean
  becameOffline: boolean
}

export class OfflineStatusTracker {
  private isOnline = true
  private lastOnlineTime = Date.now()
  private listeners: Array<(status: OfflineStatus) => void> = []

  setInitialOnlineState(isOnline: boolean): void {
    this.isOnline = isOnline
  }

  isCurrentlyOnline(): boolean {
    return this.isOnline
  }

  getStatus(queuedOperations: number, cachedContent: number): OfflineStatus {
    return {
      isOnline: this.isOnline,
      lastOnlineTime: this.lastOnlineTime,
      offlineDuration: this.isOnline ? 0 : Date.now() - this.lastOnlineTime,
      queuedOperations,
      cachedContent,
    }
  }

  updateConnection(isOnline: boolean): OfflineConnectionChange {
    const wasOnline = this.isOnline
    this.isOnline = isOnline

    const becameOffline = wasOnline && !isOnline
    const becameOnline = !wasOnline && isOnline
    if (becameOffline || becameOnline) {
      this.lastOnlineTime = Date.now()
    }

    return { becameOnline, becameOffline }
  }

  addListener(listener: (status: OfflineStatus) => void): void {
    this.listeners.push(listener)
  }

  removeListener(listener: (status: OfflineStatus) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  notify(queuedOperations: number, cachedContent: number, onError: (error: unknown) => void): void {
    const status = this.getStatus(queuedOperations, cachedContent)
    this.listeners.forEach(listener => {
      try {
        listener(status)
      } catch (error: unknown) {
        onError(error)
      }
    })
  }
}
