import { ref } from 'vue'
import type { OfflineStoreState } from './types'

export function createOfflineStoreState(): OfflineStoreState {
  return {
    offlineState: ref({
      isOnline: true,
      items: [],
      totalSize: 0,
      syncPending: false,
      lastSync: 0,
    }),
  }
}
