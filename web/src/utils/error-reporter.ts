/**
 * Standalone error reporter — no Vue / composable dependencies.
 *
 * Used by the api/ layer (transport, interceptors) instead of importing
 * useErrorHandler from composables, which was a reverse dependency violation.
 *
 * Downstream layers (composables, views) listen via `subscribe` and bridge
 * to their own toast/snackbar systems.
 */

import type { NexusError } from '@/utils/errors'
import { logger } from '@/utils/logger'

type ErrorPayload = {
  message: string
  details?: string
  timestamp: number
}

type Subscriber = (payload: ErrorPayload) => void

const subscribers = new Set<Subscriber>()

export function subscribeToErrors(fn: Subscriber): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

function emitError(payload: ErrorPayload): void {
  for (const sub of subscribers) {
    try {
      sub(payload)
    } catch {
      // subscriber failure must never break the caller
    }
  }
}

export function reportRequestError(error: NexusError): void {
  const payload: ErrorPayload = {
    message: error.message || '请求失败',
    details: error.details || error.message,
    timestamp: Date.now(),
  }

  try {
    emitError(payload)
  } catch {
    if (import.meta.env.DEV) {
      logger.error('API interceptor error reporting failed', { error })
    }
  }
}

export function reportBusinessError(message?: string): void {
  const payload: ErrorPayload = {
    message: message || '业务操作失败',
    timestamp: Date.now(),
  }

  try {
    emitError(payload)
  } catch {
    if (import.meta.env.DEV) {
      logger.error('Failed to report business error', { message })
    }
  }
}
