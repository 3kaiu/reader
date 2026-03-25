export type SyncPriority = 'CRITICAL' | 'NORMAL' | 'IDLE'

export interface SyncTask {
  id: string
  type: string
  method: string
  url: string
  data?: unknown
  priority: SyncPriority
  timestamp: number
  retryCount: number
}

export interface StoreConfig {
  name: string
  keyPath: string
  indexes?: Array<{
    name: string
    keyPath: string | string[]
    unique?: boolean
  }>
}

export interface DBConfig {
  name: string
  version: number
  stores: StoreConfig[]
}
