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

  function $reset() {
    const initial = createOfflineStoreState()
    for (const key of Object.keys(state) as (keyof typeof state)[]) {
      const ref = state[key]
      const initialRef = initial[key]
      if ('value' in ref && 'value' in initialRef) {
        ;(ref as { value: unknown }).value = (initialRef as { value: unknown }).value
      } else if (ref && typeof ref === 'object' && !('value' in ref)) {
        Object.assign(ref, initialRef)
      }
    }
  }

  void initialize()

  return {
    state: readonly(state.offlineState),
    ...view,
    ...actions,
    $reset,
  }
})
