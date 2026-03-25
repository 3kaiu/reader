import type { CachedContent } from './types'

const MAX_AGE_BY_CONTENT_TYPE: Record<CachedContent['type'], number> = {
  chapter: 7 * 24 * 60 * 60 * 1000,
  book: 30 * 24 * 60 * 60 * 1000,
  image: 14 * 24 * 60 * 60 * 1000,
  'api-response': 24 * 60 * 60 * 1000,
}

export function calculateContentSize(data: unknown): number {
  if (typeof data === 'string') {
    return data.length * 2
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength
  }
  if (data instanceof Blob) {
    return data.size
  }
  return JSON.stringify(data).length * 2
}

export class OfflineCacheRegistry {
  private cachedContent = new Map<string, CachedContent>()

  size(): number {
    return this.cachedContent.size
  }

  cache(content: Omit<CachedContent, 'timestamp'>): CachedContent {
    const cachedItem: CachedContent = {
      ...content,
      timestamp: Date.now(),
    }

    this.cachedContent.set(content.id, cachedItem)
    return cachedItem
  }

  has(id: string): boolean {
    return this.cachedContent.has(id)
  }

  remove(id: string): boolean {
    return this.cachedContent.delete(id)
  }

  clear(): void {
    this.cachedContent.clear()
  }

  get(id: string): CachedContent | null {
    return this.cachedContent.get(id) || null
  }

  search(type?: string, query?: string): CachedContent[] {
    const results = Array.from(this.cachedContent.values())

    let filtered = results
    if (type) {
      filtered = filtered.filter(item => item.type === type)
    }

    if (query) {
      const lowerQuery = query.toLowerCase()
      filtered = filtered.filter(
        item =>
          item.id.toLowerCase().includes(lowerQuery) ||
          item.url.toLowerCase().includes(lowerQuery) ||
          (typeof item.data === 'string' && item.data.toLowerCase().includes(lowerQuery))
      )
    }

    return filtered.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }
      return b.timestamp - a.timestamp
    })
  }

  getOfflineAvailableContent(now = Date.now()): CachedContent[] {
    return this.search().filter(content => now - content.timestamp < this.getMaxAge(content.type))
  }

  cleanupExpiredContent(maxAge = 7 * 24 * 60 * 60 * 1000, now = Date.now()): string[] {
    const expiredIds: string[] = []

    for (const [id, content] of this.cachedContent) {
      if (now - content.timestamp > maxAge) {
        expiredIds.push(id)
      }
    }

    expiredIds.forEach(id => {
      this.cachedContent.delete(id)
    })

    return expiredIds
  }

  snapshot(): CachedContent[] {
    return Array.from(this.cachedContent.values())
  }

  replaceAll(content: CachedContent[]): void {
    this.cachedContent.clear()
    content.forEach(item => {
      this.cachedContent.set(item.id, item)
    })
  }

  load(content: Map<string, CachedContent>): void {
    this.cachedContent = new Map(content)
  }

  values(): Iterable<CachedContent> {
    return this.cachedContent.values()
  }

  private getMaxAge(type: CachedContent['type']): number {
    return MAX_AGE_BY_CONTENT_TYPE[type] || 24 * 60 * 60 * 1000
  }
}
