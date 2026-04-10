import type { NetworkInfo, NetworkQuality } from '../types'

export function getNetworkQualityFromInfo(info: NetworkInfo): NetworkQuality {
  if (!info.isOnline) {
    return 'offline'
  }

  if (info.saveData) {
    return 'poor'
  }

  switch (info.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 'poor'
    case '3g':
      return 'fair'
    case '4g':
      return info.downlink > 10 ? 'excellent' : 'good'
    default:
      if (info.rtt < 100 && info.downlink > 10) {
        return 'excellent'
      }
      if (info.rtt < 300 && info.downlink > 5) {
        return 'good'
      }
      if (info.rtt < 500 && info.downlink > 1) {
        return 'fair'
      }
      return 'poor'
  }
}
