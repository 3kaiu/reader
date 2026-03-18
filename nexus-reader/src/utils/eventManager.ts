/**
 * Event Manager
 *
 * Provides a centralized event system for component communication
 * and application-wide event handling.
 */

import { logger } from './logger'

export interface EventData {
  [key: string]: any
}

export type EventHandler<T = EventData> = (data: T) => void | Promise<void>

class EventManager {
  private listeners = new Map<string, Set<EventHandler>>()

  /**
   * Register an event listener
   */
  on<T extends EventData = EventData>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }

    this.listeners.get(event)!.add(handler as EventHandler)

    logger.debug('Event listener registered', { event })

    // Return unsubscribe function
    return () => this.off(event, handler)
  }

  /**
   * Remove an event listener
   */
  off<T extends EventData = EventData>(event: string, handler: EventHandler<T>): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.delete(handler as EventHandler)
      if (listeners.size === 0) {
        this.listeners.delete(event)
      }
      logger.debug('Event listener removed', { event })
    }
  }

  /**
   * Emit an event to all listeners
   */
  async emit<T extends EventData = EventData>(event: string, data: T): Promise<void> {
    const listeners = this.listeners.get(event)
    if (!listeners || listeners.size === 0) {
      return
    }

    logger.debug('Event emitted', { event, listenerCount: listeners.size })

    const promises: Promise<void>[] = []

    for (const handler of listeners) {
      try {
        const result = handler(data)
        if (result instanceof Promise) {
          promises.push(result)
        }
      } catch (error: any) {
        logger.error('Event handler error', { event, error: error.message })
      }
    }

    // Wait for all async handlers to complete
    if (promises.length > 0) {
      await Promise.allSettled(promises)
    }
  }

  /**
   * Emit an event synchronously
   */
  emitSync<T extends EventData = EventData>(event: string, data: T): void {
    const listeners = this.listeners.get(event)
    if (!listeners || listeners.size === 0) {
      return
    }

    logger.debug('Event emitted (sync)', { event, listenerCount: listeners.size })

    for (const handler of listeners) {
      try {
        handler(data)
      } catch (error: any) {
        logger.error('Event handler error', { event, error: error.message })
      }
    }
  }

  /**
   * Check if an event has listeners
   */
  hasListeners(event: string): boolean {
    return this.listeners.has(event) && this.listeners.get(event)!.size > 0
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size || 0
  }

  /**
   * Clear all listeners for an event
   */
  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event)
      logger.debug('Event listeners cleared', { event })
    } else {
      this.listeners.clear()
      logger.debug('All event listeners cleared')
    }
  }

  /**
   * Get all registered event names
   */
  getEvents(): string[] {
    return Array.from(this.listeners.keys())
  }

  /**
   * Create a namespaced event manager
   */
  namespace(prefix: string): EventManager {
    const namespaced = new EventManager()

    // Override emit methods to add prefix
    const originalEmit = namespaced.emit.bind(namespaced)
    const originalEmitSync = namespaced.emitSync.bind(namespaced)

    namespaced.emit = <T extends EventData = EventData>(event: string, data: T) =>
      originalEmit(`${prefix}:${event}`, data)

    namespaced.emitSync = <T extends EventData = EventData>(event: string, data: T) =>
      originalEmitSync(`${prefix}:${event}`, data)

    return namespaced
  }
}

// Global event manager instance
let globalEventManager: EventManager | null = null

export function getEventManager(): EventManager {
  if (!globalEventManager) {
    globalEventManager = new EventManager()
  }
  return globalEventManager
}

// Export singleton instance
export const eventManager = getEventManager()

// Export class for custom instances
export { EventManager }

// Convenience functions
export const on = eventManager.on.bind(eventManager)
export const off = eventManager.off.bind(eventManager)
export const emit = eventManager.emit.bind(eventManager)
export const emitSync = eventManager.emitSync.bind(eventManager)

// Vue composable for event management
export function useEventManager() {
  const listeners = new Set<() => void>()

  const addEventListener = <T extends EventData = EventData>(
    event: string,
    handler: EventHandler<T>
  ) => {
    const unsubscribe = eventManager.on(event, handler)
    listeners.add(unsubscribe)
  }

  const removeEventListener = <T extends EventData = EventData>(
    event: string,
    handler: EventHandler<T>
  ) => {
    eventManager.off(event, handler)
  }

  const emitEvent = <T extends EventData = EventData>(event: string, data: T) => {
    return eventManager.emit(event, data)
  }

  const emitEventSync = <T extends EventData = EventData>(event: string, data: T) => {
    eventManager.emitSync(event, data)
  }

  const cleanup = () => {
    listeners.forEach(unsubscribe => unsubscribe())
    listeners.clear()
  }

  return {
    addEventListener,
    removeEventListener,
    emitEvent,
    emitEventSync,
    cleanup
  }
}

export default eventManager