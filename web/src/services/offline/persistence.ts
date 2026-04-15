import { nexusDB, StoreNames, type SyncTask } from '../../utils/db'
import type { CachedContent } from './types'

export async function loadOfflineSnapshot(): Promise<{
  operationQueue: SyncTask[]
  cachedContent: Map<string, CachedContent>
}> {
  const operationQueue = await nexusDB.getAll<SyncTask>(StoreNames.SYNC_QUEUE)
  const dbContent = await nexusDB.getAll<CachedContent>(StoreNames.OFFLINE_CONTENT)

  return {
    operationQueue,
    cachedContent: new Map<string, CachedContent>(dbContent.map(content => [content.id, content])),
  }
}

export async function persistCachedContentSnapshot(
  cachedContent: Iterable<CachedContent>
): Promise<void> {
  await nexusDB.clear(StoreNames.OFFLINE_CONTENT)
  for (const item of cachedContent) {
    await nexusDB.put(StoreNames.OFFLINE_CONTENT, item)
  }
}

export async function replacePersistedSyncQueue(tasks: SyncTask[]): Promise<void> {
  await nexusDB.clear(StoreNames.SYNC_QUEUE)
  for (const task of tasks) {
    await nexusDB.put(StoreNames.SYNC_QUEUE, task)
  }
}

export async function removePersistedCachedContent(id: string): Promise<void> {
  await nexusDB.delete(StoreNames.OFFLINE_CONTENT, id)
}

export async function clearPersistedCachedContent(): Promise<void> {
  await nexusDB.clear(StoreNames.OFFLINE_CONTENT)
}
