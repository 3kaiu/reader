import type {
  CacheableContentPayload,
  CachedContent,
} from '../../types'
import {
  cacheOfflineContent,
  cleanupExpiredOfflineContent,
  clearOfflineCachedContent,
  precacheOfflineContent,
  removeOfflineCachedContent,
} from '../cache'
import {
  createOfflineManagerCacheCallbacks,
  createOfflineManagerStatusCallbacks,
  type OfflineManagerRuntimeContext,
} from './context'

export function cacheOfflineManagerContent(
  context: OfflineManagerRuntimeContext,
  content: Omit<CachedContent, 'timestamp'>,
): void {
  cacheOfflineContent(
    context.runtimeState,
    content,
    createOfflineManagerCacheCallbacks(context),
  )
}

export async function removeOfflineManagerCachedContent(
  context: OfflineManagerRuntimeContext,
  id: string,
): Promise<void> {
  await removeOfflineCachedContent(
    context.runtimeState,
    id,
    createOfflineManagerCacheCallbacks(context),
  )
}

export async function clearOfflineManagerCachedContent(
  context: OfflineManagerRuntimeContext,
): Promise<void> {
  await clearOfflineCachedContent(
    context.runtimeState,
    createOfflineManagerStatusCallbacks(context),
  )
}

export function getOfflineManagerCachedContent(
  context: OfflineManagerRuntimeContext,
  id: string,
): CachedContent | null {
  return context.runtimeState.cacheRegistry.get(id)
}

export function searchOfflineManagerCachedContent(
  context: OfflineManagerRuntimeContext,
  type?: string,
  query?: string,
): CachedContent[] {
  return context.runtimeState.cacheRegistry.search(type, query)
}

export function cleanupOfflineManagerExpiredContent(
  context: OfflineManagerRuntimeContext,
  maxAge = 7 * 24 * 60 * 60 * 1000,
): void {
  cleanupExpiredOfflineContent(
    context.runtimeState,
    createOfflineManagerCacheCallbacks(context),
    maxAge,
  )
}

export function getOfflineManagerAvailableContent(
  context: OfflineManagerRuntimeContext,
): CachedContent[] {
  return context.runtimeState.cacheRegistry.getOfflineAvailableContent()
}

export async function precacheOfflineManagerImportantContent(
  context: OfflineManagerRuntimeContext,
  contentIds: string[],
): Promise<void> {
  await precacheOfflineContent(
    context.runtimeState,
    contentIds,
    createOfflineManagerCacheCallbacks(context),
  )
}

export async function fetchOfflineManagerContentForCaching(
  _id: string,
): Promise<CacheableContentPayload | null> {
  return null
}
