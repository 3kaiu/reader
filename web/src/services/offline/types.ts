export interface OfflineStatus {
  isOnline: boolean
  lastOnlineTime: number
  offlineDuration: number
  queuedOperations: number
  cachedContent: number
}

export interface CachedContent {
  id: string
  type: 'chapter' | 'book' | 'image' | 'api-response'
  url: string
  bookUrl?: string
  chapterUrl?: string
  data: unknown
  timestamp: number
  size: number
  priority: number
}

export interface CacheableContentPayload {
  type: CachedContent['type']
  url: string
  data: unknown
}
