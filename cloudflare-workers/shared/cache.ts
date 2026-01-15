/**
 * KV Cache Utilities
 * Centralized caching logic for content, TOC, and search results
 */

export const CACHE_TTL = {
  CONTENT: 7 * 24 * 60 * 60,  // 7 days
  TOC: 24 * 60 * 60,           // 1 day
  SEARCH: 60 * 60,             // 1 hour
} as const;

export function generateCacheKey(path: string, params?: Record<string, any>): string {
  const key = `cache:${path}:${JSON.stringify(params || {})}`;
  return key.replace(/[^a-zA-Z0-9:_-]/g, '_').substring(0, 512);
}

export async function getFromCache(
  kv: KVNamespace | undefined,
  key: string
): Promise<{ body: string; contentType: string } | null> {
  if (!kv) return null;
  
  try {
    const data = await kv.get(key, { type: 'json' });
    if (!data) return null;
    
    return {
      body: (data as any).body,
      contentType: (data as any).contentType || 'application/json'
    };
  } catch (e) {
    console.error('KV get error:', e);
    return null;
  }
}

export async function saveToCache(
  kv: KVNamespace | undefined,
  key: string,
  body: string,
  contentType: string,
  ttlSeconds: number
): Promise<void> {
  if (!kv) return;
  
  try {
    await kv.put(key, JSON.stringify({
      body,
      contentType,
      cachedAt: new Date().toISOString()
    }), {
      expirationTtl: ttlSeconds
    });
  } catch (e) {
    console.error('KV put error:', e);
  }
}
