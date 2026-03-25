import type {
  CachedContent,
  OfflineStatus,
} from '../../types'
import {
  exportOfflineManagerData,
  importOfflineManagerData,
  persistOfflineCachedContent,
  refreshOfflineManagerState,
} from '../persistence'
import {
  addOfflineStatusListener,
  getOfflineManagerStatus,
  isOfflineManagerOnline,
  notifyOfflineStatusListeners,
  removeOfflineStatusListener,
} from '../status'
import type {
  OfflineExportData,
  OfflineManagerRuntimeState,
} from '../types'
import {
  createOfflineManagerCacheCallbacks,
  createOfflineManagerStatusCallbacks,
  type OfflineManagerRuntimeContext,
} from './context'

export function getOfflineManagerRuntimeStatus(
  context: OfflineManagerRuntimeContext,
): OfflineStatus {
  return getOfflineManagerStatus(context.runtimeState)
}

export function isOfflineManagerRuntimeOnline(
  context: OfflineManagerRuntimeContext,
): boolean {
  return isOfflineManagerOnline(context.runtimeState)
}

export function addOfflineManagerStatusListener(
  context: OfflineManagerRuntimeContext,
  listener: (status: OfflineStatus) => void,
): void {
  addOfflineStatusListener(context.runtimeState, listener)
}

export function removeOfflineManagerStatusListener(
  context: OfflineManagerRuntimeContext,
  listener: (status: OfflineStatus) => void,
): void {
  removeOfflineStatusListener(context.runtimeState, listener)
}

export function exportOfflineManagerRuntimeData(
  context: OfflineManagerRuntimeContext,
): OfflineExportData {
  return exportOfflineManagerData(context.runtimeState)
}

export function importOfflineManagerRuntimeData(
  context: OfflineManagerRuntimeContext,
  data: {
    operations?: OfflineManagerRuntimeState['operationQueue']
    content?: CachedContent[]
  },
): void {
  importOfflineManagerData(
    context.runtimeState,
    data,
    createOfflineManagerCacheCallbacks(context),
  )
}

export async function refreshOfflineManagerRuntimeState(
  context: OfflineManagerRuntimeContext,
): Promise<void> {
  await refreshOfflineManagerState(
    context.runtimeState,
    createOfflineManagerStatusCallbacks(context),
  )
}

export async function persistOfflineManagerCachedContent(
  context: OfflineManagerRuntimeContext,
): Promise<void> {
  await persistOfflineCachedContent(context.runtimeState)
}

export function notifyOfflineManagerStatusListeners(
  context: OfflineManagerRuntimeContext,
): void {
  notifyOfflineStatusListeners(context.runtimeState)
}
