import { getNavigatorConnection } from '../runtime'
import type { NetworkInfo } from '../types'

export function getFallbackNetworkInfo(): NetworkInfo {
  return {
    effectiveType: 'unknown',
    downlink: 0,
    rtt: 0,
    saveData: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    connectionType: 'unknown',
  }
}

export function detectNetworkInfo(): NetworkInfo {
  if (typeof navigator === 'undefined') {
    return getFallbackNetworkInfo()
  }

  const connection = getNavigatorConnection()
  const isOnline = navigator.onLine

  if (connection) {
    return {
      effectiveType: connection.effectiveType || 'unknown',
      downlink: connection.downlink || 0,
      rtt: connection.rtt || 0,
      saveData: connection.saveData || false,
      isOnline,
      connectionType: connection.type || 'unknown',
    }
  }

  return getFallbackNetworkInfo()
}

export function hasNetworkChanged(
  currentInfo: NetworkInfo | null,
  nextInfo: NetworkInfo,
): boolean {
  if (!currentInfo) {
    return true
  }

  return (
    currentInfo.effectiveType !== nextInfo.effectiveType ||
    currentInfo.isOnline !== nextInfo.isOnline ||
    currentInfo.saveData !== nextInfo.saveData ||
    Math.abs(currentInfo.downlink - nextInfo.downlink) > 1 ||
    Math.abs(currentInfo.rtt - nextInfo.rtt) > 50
  )
}
