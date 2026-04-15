/**
 * Database utilities for IndexedDB operations
 *
 * Public facade for the local IndexedDB runtime, store config, and sync task types.
 */

export { StoreNames } from './db/config'
export { nexusDB } from './db/instance'
export type { SyncTask } from './db/types'
