import { offlineManager } from '@/services/offline/manager'
import type { OfflineStoreActions } from './types'
import type { OfflineStoreActionHelpers } from './actions-types'
import type { OfflineStoreState } from './types'

export function createOfflineStoreQueryActions(options: {
  state: OfflineStoreState
  helpers: OfflineStoreActionHelpers
  initialize: () => Promise<void>
}) {
  const getBookCacheStatus: OfflineStoreActions['getBookCacheStatus'] = (
    bookUrl,
    totalChapters,
  ) => {
    const cached = options.state.offlineState.value.items.filter(
      item => item.type === 'chapter' && item.bookUrl === bookUrl,
    ).length

    const safeTotal = Math.max(totalChapters, 0)
    const percentage =
      safeTotal > 0 ? Math.min(100, Math.round((cached / safeTotal) * 100)) : 0

    return {
      cached,
      total: safeTotal,
      percentage,
    }
  }

  const getItem: OfflineStoreActions['getItem'] = async id => {
    await options.initialize()
    const cachedItem = offlineManager.getCachedContent(id)
    return cachedItem ? options.helpers.toOfflineItem(cachedItem) : null
  }

  return {
    getBookCacheStatus,
    getItem,
  }
}
