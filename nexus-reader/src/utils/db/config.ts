import type { DBConfig } from './types'

export const NEXUS_DB_NAME = 'nexus'
export const LEGACY_NEXUS_DB_NAMES = ['nexus-reader'] as const

export enum StoreNames {
  PROGRESS = 'progress',
  SYNC_QUEUE = 'syncQueue',
  OFFLINE_CONTENT = 'offlineContent',
  BOOKS = 'books',
  CHAPTERS = 'chapters',
  SETTINGS = 'settings',
  CACHE = 'cache',
}

export const nexusDBConfig: DBConfig = {
  name: NEXUS_DB_NAME,
  legacyNames: [...LEGACY_NEXUS_DB_NAMES],
  version: 2,
  stores: [
    {
      name: StoreNames.PROGRESS,
      keyPath: 'bookId',
      indexes: [{ name: 'updatedAt', keyPath: 'updatedAt' }],
    },
    {
      name: StoreNames.SYNC_QUEUE,
      keyPath: 'id',
      indexes: [
        { name: 'priority', keyPath: 'priority' },
        { name: 'timestamp', keyPath: 'timestamp' },
      ],
    },
    {
      name: StoreNames.OFFLINE_CONTENT,
      keyPath: 'id',
      indexes: [
        { name: 'type', keyPath: 'type' },
        { name: 'priority', keyPath: 'priority' },
      ],
    },
    {
      name: StoreNames.BOOKS,
      keyPath: 'id',
      indexes: [
        { name: 'title', keyPath: 'title' },
        { name: 'author', keyPath: 'author' },
        { name: 'groupId', keyPath: 'groupId' },
      ],
    },
    {
      name: StoreNames.CHAPTERS,
      keyPath: 'id',
      indexes: [
        { name: 'bookId', keyPath: 'bookId' },
        { name: 'title', keyPath: 'title' },
      ],
    },
    {
      name: StoreNames.SETTINGS,
      keyPath: 'key',
    },
    {
      name: StoreNames.CACHE,
      keyPath: 'key',
      indexes: [
        { name: 'url', keyPath: 'url' },
        { name: 'type', keyPath: 'type' },
      ],
    },
  ],
}
