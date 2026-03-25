import { logger } from '@/utils/logger'
import type { NetworkInfo } from '../types'

export function addNetworkListener(
  listeners: Array<(info: NetworkInfo) => void>,
  listener: (info: NetworkInfo) => void,
): void {
  listeners.push(listener)
}

export function removeNetworkListener(
  listeners: Array<(info: NetworkInfo) => void>,
  listener: (info: NetworkInfo) => void,
): void {
  const index = listeners.indexOf(listener)
  if (index > -1) {
    listeners.splice(index, 1)
  }
}

export function notifyNetworkListeners(
  listeners: Array<(info: NetworkInfo) => void>,
  info: NetworkInfo,
): void {
  listeners.forEach(listener => {
    try {
      listener(info)
    } catch (error: unknown) {
      logger.error('Network change listener error', { error })
    }
  })
}
