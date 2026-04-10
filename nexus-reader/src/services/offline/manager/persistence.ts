import { logger } from '../../../utils/logger'
import {
  loadOfflineSnapshot,
  persistCachedContentSnapshot,
  replacePersistedSyncQueue,
} from '../persistence'
import type { CachedContent } from '../types'
import type {
  OfflineExportData,
  OfflineManagerPersistenceOptions,
  OfflineManagerRuntimeState,
} from './types'
import { getOfflineManagerStatus } from './status'

export async function persistOfflineCachedContent(
  state: OfflineManagerRuntimeState
): Promise<void> {
  try {
    await persistCachedContentSnapshot(state.cacheRegistry.values())
  } catch (error: unknown) {
    logger.error('Failed to persist cached content', { error })
  }
}

export async function syncOfflineManagerFromDatabase(
  state: OfflineManagerRuntimeState
): Promise<void> {
  const snapshot = await loadOfflineSnapshot()
  state.operationQueue = snapshot.operationQueue
  state.cacheRegistry.load(snapshot.cachedContent)
}

export async function loadOfflineManagerData(
  state: OfflineManagerRuntimeState,
  options: OfflineManagerPersistenceOptions
): Promise<void> {
  try {
    await syncOfflineManagerFromDatabase(state)

    logger.info('Loaded offline data', {
      queuedOperations: state.operationQueue.length,
      cachedItems: state.cacheRegistry.size(),
    })
    options.notifyListeners()
  } catch (error: unknown) {
    logger.error('Failed to load persisted offline data', { error })
  }
}

export async function refreshOfflineManagerState(
  state: OfflineManagerRuntimeState,
  options: OfflineManagerPersistenceOptions
): Promise<void> {
  try {
    await syncOfflineManagerFromDatabase(state)
    options.notifyListeners()
  } catch (error: unknown) {
    logger.error('Failed to refresh offline data', { error })
    throw error
  }
}

export function exportOfflineManagerData(state: OfflineManagerRuntimeState): OfflineExportData {
  return {
    operations: [...state.operationQueue],
    content: state.cacheRegistry.snapshot(),
    status: getOfflineManagerStatus(state),
  }
}

export function importOfflineManagerData(
  state: OfflineManagerRuntimeState,
  data: { operations?: typeof state.operationQueue; content?: CachedContent[] },
  options: {
    persistCachedContent: () => Promise<void>
    notifyListeners: () => void
  }
): void {
  if (data.operations) {
    state.operationQueue = data.operations
    void replacePersistedSyncQueue(data.operations).catch(err =>
      logger.error('Failed to import sync queue', { error: err })
    )
  }

  if (data.content) {
    state.cacheRegistry.replaceAll(data.content)
    void options.persistCachedContent()
  }

  options.notifyListeners()
}
