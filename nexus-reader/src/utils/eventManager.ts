/**
 * Event Manager
 *
 * Provides a centralized event system for component communication
 * and application-wide event handling.
 */

import { logger } from './logger'

export interface EventData {
  [key: string]: unknown
}

export type EventHandler<T = EventData> = (data: T) => void | Promise<void>

const listeners = new Map<string, Set<EventHandler>>()

function on<T extends EventData = EventData>(event: string, handler: EventHandler<T>): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set())
  }

  listeners.get(event)!.add(handler as EventHandler)
  logger.debug('Event listener registered', { event })

  return () => off(event, handler)
}

function off<T extends EventData = EventData>(event: string, handler: EventHandler<T>): void {
  const handlers = listeners.get(event)
  if (!handlers) {
    return
  }

  handlers.delete(handler as EventHandler)
  if (handlers.size === 0) {
    listeners.delete(event)
  }
  logger.debug('Event listener removed', { event })
}

async function emit<T extends EventData = EventData>(event: string, data: T): Promise<void> {
  const handlers = listeners.get(event)
  if (!handlers || handlers.size === 0) {
    return
  }

  logger.debug('Event emitted', { event, listenerCount: handlers.size })

  const pending: Promise<void>[] = []
  for (const handler of handlers) {
    try {
      const result = handler(data)
      if (result instanceof Promise) {
        pending.push(result)
      }
    } catch (error: unknown) {
      logger.error('Event handler error', {
        event,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (pending.length > 0) {
    await Promise.allSettled(pending)
  }
}

// Vue composable for event management
export function useEventManager() {
  const listeners = new Set<() => void>()

  const addEventListener = <T extends EventData = EventData>(
    event: string,
    handler: EventHandler<T>
  ) => {
    const unsubscribe = on(event, handler)
    listeners.add(unsubscribe)
  }

  const cleanup = () => {
    listeners.forEach(unsubscribe => unsubscribe())
    listeners.clear()
  }

  return {
    addEventListener,
    emitEvent: emit,
    cleanup,
  }
}
