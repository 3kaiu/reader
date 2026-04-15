import { logger } from '../../utils/logger'

export interface OfflineContentDescriptor {
  url: string
  type: string
  size: number
  timestamp: number
}

export interface OfflineContentRecord {
  url: string
  type: string
  size: number
  timestamp: number
  data: unknown
}

export interface OfflineContentReader {
  getCachedContent(id: string): OfflineContentRecord | null
  getOfflineAvailableContent(): OfflineContentRecord[]
}

export class OfflineContentServer {
  constructor(private readonly offlineManager: OfflineContentReader) {}

  async serveFromCache(url: string): Promise<unknown> {
    const cacheKey = this.generateCacheKey(url)
    const cached = this.offlineManager.getCachedContent(cacheKey)
    if (cached) {
      logger.debug('Serving from offline cache:', { url })
      return cached.data
    }

    throw new Error('Content not available offline')
  }

  isContentAvailableOffline(url: string): boolean {
    const cacheKey = this.generateCacheKey(url)
    return this.offlineManager.getCachedContent(cacheKey) !== null
  }

  getAvailableOfflineContent(): OfflineContentDescriptor[] {
    return this.offlineManager.getOfflineAvailableContent().map(content => ({
      url: content.url,
      type: content.type,
      size: content.size,
      timestamp: content.timestamp,
    }))
  }

  private generateCacheKey(url: string): string {
    if (url.startsWith('api:')) return url
    return url.replace(/[^a-zA-Z0-9]/g, '_')
  }
}
