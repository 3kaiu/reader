import { clearOfflineQueue, queueOfflineOperation, syncOfflineQueue } from '../queue'
import type { OfflineOperationInput } from '../types'
import {
  createOfflineManagerQueueCallbacks,
  createOfflineManagerRefreshCallbacks,
  type OfflineManagerRuntimeContext,
} from './context'

export function clearOfflineManagerQueue(context: OfflineManagerRuntimeContext): void {
  clearOfflineQueue(context.runtimeState, createOfflineManagerQueueCallbacks(context))
}

export async function queueOfflineManagerOperation(
  context: OfflineManagerRuntimeContext,
  operation: OfflineOperationInput
): Promise<void> {
  await queueOfflineOperation(operation, createOfflineManagerRefreshCallbacks(context))
}

export async function syncOfflineManagerQueuedOperations(
  context: OfflineManagerRuntimeContext
): Promise<void> {
  await syncOfflineQueue(createOfflineManagerRefreshCallbacks(context))
}
