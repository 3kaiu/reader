import { offlineManager } from '@/services/offline/manager'
import type { OfflineStoreActions, OfflineStoreState } from './types'
import type { OfflineStoreActionHelpers } from './actions-types'

export function createOfflineStoreCacheActions(options: {
  state: OfflineStoreState
  helpers: OfflineStoreActionHelpers
  initialize: () => Promise<void>
}) {
  const storeItem: OfflineStoreActions['storeItem'] = async item => {
    await options.initialize()

    const serialized = JSON.stringify(item.data)
    offlineManager.cacheContent({
      id: item.id,
      type: options.helpers.mapOfflineTypeToCachedType(item.type),
      url: options.helpers.resolveCachedUrl(item),
      data: item.data,
      size: serialized.length * 2,
      priority: item.type === 'chapter' ? 10 : item.type === 'book' ? 8 : 5,
      bookUrl: typeof item.bookUrl === 'string' ? item.bookUrl : undefined,
      chapterUrl: typeof item.chapterUrl === 'string' ? item.chapterUrl : undefined,
    })
    options.helpers.syncStateFromManager()
  }

  const removeItem: OfflineStoreActions['removeItem'] = async id => {
    await options.initialize()
    await offlineManager.removeCachedContent(id)
    options.helpers.syncStateFromManager()
  }

  const clearAll: OfflineStoreActions['clearAll'] = async () => {
    await options.initialize()
    await offlineManager.clearCachedContent()
    options.helpers.syncStateFromManager()
  }

  return {
    storeItem,
    removeItem,
    clearAll,
  }
}
