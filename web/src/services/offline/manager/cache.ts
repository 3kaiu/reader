import { calculateContentSize } from '../cacheRegistry'
import { logger } from '../../../utils/logger'
import { clearPersistedCachedContent, removePersistedCachedContent } from '../persistence'
import type { CachedContent } from '../types'
import type { OfflineManagerCacheOptions, OfflineManagerRuntimeState } from './types'

export function cacheOfflineContent(
  state: OfflineManagerRuntimeState,
  content: Omit<CachedContent, 'timestamp'>,
  options: Pick<OfflineManagerCacheOptions, 'persistCachedContent' | 'notifyListeners'>
): void {
  state.cacheRegistry.cache(content)
  void options.persistCachedContent()
  options.notifyListeners()
}

export async function removeOfflineCachedContent(
  state: OfflineManagerRuntimeState,
  id: string,
  options: Pick<OfflineManagerCacheOptions, 'persistCachedContent' | 'notifyListeners'>
): Promise<void> {
  if (!state.cacheRegistry.has(id)) {
    return
  }

  state.cacheRegistry.remove(id)
  try {
    await removePersistedCachedContent(id)
  } catch (error: unknown) {
    logger.error('Failed to delete cached content by key, falling back to snapshot persist', {
      error,
      id,
    })
    await options.persistCachedContent()
  }

  options.notifyListeners()
}

export async function clearOfflineCachedContent(
  state: OfflineManagerRuntimeState,
  options: Pick<OfflineManagerCacheOptions, 'notifyListeners'>
): Promise<void> {
  state.cacheRegistry.clear()
  try {
    await clearPersistedCachedContent()
  } catch (error: unknown) {
    logger.error('Failed to clear cached content store', { error })
  }
  options.notifyListeners()
}

export function cleanupExpiredOfflineContent(
  state: OfflineManagerRuntimeState,
  options: Pick<OfflineManagerCacheOptions, 'persistCachedContent' | 'notifyListeners'>,
  maxAge = 7 * 24 * 60 * 60 * 1000
): void {
  const expiredIds = state.cacheRegistry.cleanupExpiredContent(maxAge)
  if (expiredIds.length > 0) {
    void options.persistCachedContent()
    options.notifyListeners()
  }
}

export async function precacheOfflineContent(
  state: OfflineManagerRuntimeState,
  contentIds: string[],
  options: OfflineManagerCacheOptions
): Promise<void> {
  if (!state.statusTracker.isCurrentlyOnline()) {
    logger.warn('Cannot precache content while offline')
    return
  }

  for (const id of contentIds) {
    try {
      const content = await options.fetchContentForCaching(id)
      if (content) {
        cacheOfflineContent(
          state,
          {
            id,
            type: content.type,
            url: content.url,
            data: content.data,
            size: calculateContentSize(content.data),
            priority: 10,
          },
          options
        )
      }
    } catch (error: unknown) {
      logger.error('Failed to precache content:', { id, error })
    }
  }
}
