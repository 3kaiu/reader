import type { CacheableContentPayload } from '../../types'
import type { OfflineManagerRuntimeState } from '../types'

export interface OfflineManagerRuntimeContext {
  runtimeState: OfflineManagerRuntimeState
  refreshPersistedState: () => Promise<void>
  persistCachedContent: () => Promise<void>
  notifyListeners: () => void
  fetchContentForCaching: (id: string) => Promise<CacheableContentPayload | null>
  syncQueuedOperations: () => Promise<void>
}

export type OfflineManagerRuntimeHandlers = Omit<
  OfflineManagerRuntimeContext,
  'runtimeState'
>

export function createOfflineManagerRuntimeContext(
  runtimeState: OfflineManagerRuntimeState,
  handlers: OfflineManagerRuntimeHandlers,
): OfflineManagerRuntimeContext {
  return {
    runtimeState,
    ...handlers,
  }
}

export function createOfflineManagerQueueCallbacks(
  context: OfflineManagerRuntimeContext,
) {
  return {
    refreshPersistedState: () => context.refreshPersistedState(),
    notifyListeners: () => context.notifyListeners(),
  }
}

export function createOfflineManagerRefreshCallbacks(
  context: OfflineManagerRuntimeContext,
) {
  return {
    refreshPersistedState: () => context.refreshPersistedState(),
  }
}

export function createOfflineManagerCacheCallbacks(
  context: OfflineManagerRuntimeContext,
) {
  return {
    persistCachedContent: () => context.persistCachedContent(),
    notifyListeners: () => context.notifyListeners(),
    fetchContentForCaching: (id: string) => context.fetchContentForCaching(id),
  }
}

export function createOfflineManagerStatusCallbacks(
  context: OfflineManagerRuntimeContext,
) {
  return {
    notifyListeners: () => context.notifyListeners(),
  }
}
