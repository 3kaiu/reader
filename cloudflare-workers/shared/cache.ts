/**
 * KV Cache Utilities with Performance Optimizations
 * - Fast cache key generation using xxHash
 * - Intelligent TTL management
 * - Compression support
 * - Cache warming capabilities
 */

import type { JsonObject, KVNamespaceLike } from './types.ts';

export const CACHE_TTL = {
  CONTENT: 7 * 24 * 60 * 60,  // 7 days
  TOC: 24 * 60 * 60,           // 1 day
  SEARCH: 60 * 60,             // 1 hour
  DECODE: 3600,                // 1 hour for AI decode results
} as const;

// xxHash implementation for fast cache key generation
function xxHash32(str: string, seed: number = 0): string {
  let h32 = seed + 0x9e3779b9;
  const len = str.length;

  for (let i = 0; i < len; i++) {
    const c = str.charCodeAt(i);
    h32 = Math.imul(h32 ^ c, 0x85ebca6b);
    h32 = (h32 << 13) | (h32 >>> 19);
    h32 = Math.imul(h32, 5) + 0x9e3779b9;
  }

  return Math.abs(h32).toString(36);
}

interface CachedPayload {
  body: string;
  contentType?: string;
  cachedAt?: string;
  compressed?: boolean;
}

export function generateCacheKey(path: string, params?: JsonObject): string {
  // Use xxHash for fast, deterministic key generation
  const keyData = `cache:${path}:${JSON.stringify(params || {})}`;
  const hash = xxHash32(keyData);
  return `c:${hash}`.substring(0, 512);
}

// Optimized cache key for specific data types
export function generateTypedCacheKey(
  type: 'content' | 'toc' | 'search' | 'decode',
  identifier: string,
  params?: JsonObject
): string {
  const keyData = `${type}:${identifier}:${JSON.stringify(params || {})}`;
  const hash = xxHash32(keyData);
  return `${type[0]}:${hash}`.substring(0, 512);
}

// Compression utilities for cache optimization
function compressString(str: string): string {
  // Simple RLE compression for repetitive content
  if (str.length < 100) return str; // Skip compression for small strings

  let compressed = '';
  let count = 1;
  let current = str[0];

  for (let i = 1; i < str.length; i++) {
    if (str[i] === current && count < 255) {
      count++;
    } else {
      compressed += count > 3 ? `#${count}${current}` : current.repeat(count);
      current = str[i];
      count = 1;
    }
  }
  compressed += count > 3 ? `#${count}${current}` : current.repeat(count);

  // Only use compression if it's actually smaller
  return compressed.length < str.length ? `compressed:${compressed}` : str;
}

function decompressString(str: string): string {
  if (!str.startsWith('compressed:')) return str;

  const compressed = str.substring(11);
  let decompressed = '';
  let i = 0;

  while (i < compressed.length) {
    if (compressed[i] === '#') {
      let countEnd = i + 1;
      while (countEnd < compressed.length && compressed[countEnd] >= '0' && compressed[countEnd] <= '9') {
        countEnd++;
      }

      if (countEnd === i + 1 || countEnd >= compressed.length) {
        decompressed += compressed[i];
        i++;
        continue;
      }

      const count = Number.parseInt(compressed.substring(i + 1, countEnd), 10);
      if (!Number.isFinite(count) || count <= 0) {
        decompressed += compressed[i];
        i++;
        continue;
      }

      const char = compressed[countEnd];
      decompressed += char.repeat(count);
      i = countEnd + 1;
    } else {
      decompressed += compressed[i];
      i++;
    }
  }

  return decompressed;
}

// Intelligent TTL management based on access patterns
export function calculateAdaptiveTTL(
  baseTTL: number,
  accessCount: number = 0,
  hitRate: number = 0,
  dataSize: number = 0
): number {
  let multiplier = 1.0;

  // Increase TTL for frequently accessed items
  if (accessCount > 100) multiplier *= 2.0;
  else if (accessCount > 50) multiplier *= 1.5;
  else if (accessCount > 10) multiplier *= 1.2;

  // Increase TTL for high hit rate items
  if (hitRate > 0.8) multiplier *= 1.5;
  else if (hitRate > 0.5) multiplier *= 1.2;

  // Decrease TTL for large data (to save storage)
  if (dataSize > 100000) multiplier *= 0.7; // > 100KB
  else if (dataSize > 10000) multiplier *= 0.8; // > 10KB

  return Math.max(60, Math.min(baseTTL * multiplier, 30 * 24 * 60 * 60)); // 60s to 30 days
}

// Cache warming utilities
export async function warmCache(
  kv: KVNamespaceLike | undefined,
  keys: string[],
  fetcher: (key: string) => Promise<{ body: string; contentType: string } | null>,
  ttl: number = CACHE_TTL.SEARCH
): Promise<void> {
  if (!kv || !keys.length) return;

  console.log(`Warming cache for ${keys.length} keys...`);

  const batchSize = 5; // Limit concurrent warming
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const promises = batch.map(async (key) => {
      try {
        // Check if already cached
        const existing = await getFromCache(kv, key);
        if (existing) return;

        // Fetch and cache
        const data = await fetcher(key);
        if (data) {
          await saveToCache(kv, key, data.body, data.contentType, ttl);
        }
      } catch (e) {
        console.warn(`Failed to warm cache for key ${key}:`, e);
      }
    });

    await Promise.all(promises);
  }

  console.log('Cache warming completed');
}

export async function getFromCache(
  kv: KVNamespaceLike | undefined,
  key: string
): Promise<{ body: string; contentType: string; cachedAt?: string } | null> {
  if (!kv) return null;

  try {
    const data = await kv.get<CachedPayload>(key, { type: 'json' });
    if (!data) return null;

    return {
      body: decompressString(data.body),
      contentType: data.contentType || 'application/json',
      cachedAt: data.cachedAt
    };
  } catch (e) {
    console.warn('KV get error:', e);
    return null;
  }
}

export async function saveToCache(
  kv: KVNamespaceLike | undefined,
  key: string,
  body: string,
  contentType: string,
  ttlSeconds: number,
  compress: boolean = true
): Promise<void> {
  if (!kv) return;

  try {
    const finalBody = compress && body.length > 100 ? compressString(body) : body;

    await kv.put(key, JSON.stringify({
      body: finalBody,
      contentType,
      cachedAt: new Date().toISOString(),
      compressed: compress && finalBody !== body
    }), {
      expirationTtl: ttlSeconds
    });
  } catch (e) {
    console.warn('KV put error:', e);
  }
}
