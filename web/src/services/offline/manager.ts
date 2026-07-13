import { bootstrapOfflineManager } from './manager/bootstrap'
import { OfflineManager } from './manager/runtime'

export type { CachedContent, OfflineStatus } from './types'

// 全局实例
export const offlineManager = new OfflineManager()

if (typeof window !== 'undefined') {
  bootstrapOfflineManager(offlineManager)
}
