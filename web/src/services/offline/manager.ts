import { bootstrapOfflineManager } from './manager/bootstrap'
import { OfflineManager } from './manager/runtime'

export type { CachedContent, OfflineStatus } from './types'

// 全局实例
export const offlineManager = new OfflineManager()

/**
 * Cleanup function for the module-level bootstrap (interval + listeners).
 * Exposed so tests or app teardown can release resources; calling it more
 * than once is a no-op safe pattern but the current caller is expected to
 * invoke it at most once.
 */
let disposeBootstrap: (() => void) | null = null

if (typeof window !== 'undefined') {
  disposeBootstrap = bootstrapOfflineManager(offlineManager)
}

export function disposeOfflineManager(): void {
  if (disposeBootstrap) {
    disposeBootstrap()
    disposeBootstrap = null
  }
  offlineManager.dispose()
}
