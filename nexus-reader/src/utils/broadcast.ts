/**
 * Broadcast Channel Utilities
 * Provides a simple interface for cross-tab communication
 */

export interface BroadcastMessage<T = any> {
  type: string
  data: T
  timestamp: number
}

export class SyncChannel {
  private channel: BroadcastChannel
  private listeners: Map<string, Set<(data: any) => void>> = new Map()

  constructor(channelName: string) {
    this.channel = new BroadcastChannel(channelName)
    this.channel.onmessage = (event) => {
      const { type, data } = event.data
      const handlers = this.listeners.get(type)
      if (handlers) {
        handlers.forEach(handler => handler(data))
      }
    }
  }

  /**
   * Publish a message to the channel
   */
  publish<T = any>(type: string, data: T): void {
    const message: BroadcastMessage<T> = {
      type,
      data,
      timestamp: Date.now()
    }
    this.channel.postMessage(message)
  }

  /**
   * Subscribe to a specific message type
   */
  subscribe(type: string, handler: (data: any) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(handler)

    // Return unsubscribe function
    return () => {
      const handlers = this.listeners.get(type)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          this.listeners.delete(type)
        }
      }
    }
  }

  /**
   * Close the channel
   */
  close(): void {
    this.channel.close()
    this.listeners.clear()
  }
}

// Singleton instances for common channels
const channelInstances = new Map<string, SyncChannel>()

export function getChannel(channelName: string): SyncChannel {
  if (!channelInstances.has(channelName)) {
    channelInstances.set(channelName, new SyncChannel(channelName))
  }
  return channelInstances.get(channelName)!
}

// Default channel for general use
export const syncChannel = getChannel('nexus-reader-sync')
