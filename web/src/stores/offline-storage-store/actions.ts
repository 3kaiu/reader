import { createOfflineStoreCacheActions } from './actions-cache'
import { createOfflineStoreInitializer } from './actions-init'
import { createOfflineStoreQueryActions } from './actions-query'
import { createOfflineStoreSyncActions } from './actions-sync'
import { createOfflineStoreActionRuntime, type OfflineStoreActionHelpers } from './actions-types'
import type { OfflineStoreState } from './types'

export function createOfflineStoreActions(
  state: OfflineStoreState,
  helpers: OfflineStoreActionHelpers
) {
  const runtime = createOfflineStoreActionRuntime()
  const initialize = createOfflineStoreInitializer(state, helpers, runtime)
  const cacheActions = createOfflineStoreCacheActions({
    state,
    helpers,
    initialize,
  })
  const syncActions = createOfflineStoreSyncActions({
    state,
    helpers,
    initialize,
  })
  const queryActions = createOfflineStoreQueryActions({
    state,
    helpers,
    initialize,
  })

  return {
    initialize,
    ...cacheActions,
    ...syncActions,
    ...queryActions,
  }
}
