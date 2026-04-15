import { computed } from 'vue'
import type { OfflineStoreState, OfflineStoreView } from './types'

export function createOfflineStoreView(state: OfflineStoreState): OfflineStoreView {
  return {
    isOnline: computed(() => state.offlineState.value.isOnline),
    offlineItemsCount: computed(() => state.offlineState.value.items.length),
    totalSize: computed(() => state.offlineState.value.totalSize),
    hasPendingSync: computed(() => state.offlineState.value.syncPending),
  }
}
