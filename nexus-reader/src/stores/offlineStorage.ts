/**
 * 离线存储状态管理
 */
import { defineStore } from 'pinia'
import { readonly } from 'vue'
import { createOfflineStoreActions } from './offline-storage-store/actions'
import { createOfflineStoreHelpers } from './offline-storage-store/helpers'
import { createOfflineStoreState } from './offline-storage-store/state'
import { createOfflineStoreView } from './offline-storage-store/view'

export const useOfflineStore = defineStore('offlineStorage', () => {
  const state = createOfflineStoreState()
  const view = createOfflineStoreView(state)
  const helpers = createOfflineStoreHelpers(state)
  const { initialize, ...actions } = createOfflineStoreActions(state, helpers)

  void initialize()

  return {
    state: readonly(state.offlineState),
    ...view,
    ...actions,
  }
})
