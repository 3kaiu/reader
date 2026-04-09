export type BrowserStorageEstimate = {
  used: number
  quota: number
}

export type ChapterCachePolicy = {
  maxEntries: number
  ttlMs: number
}

const MIN_CHAPTER_CACHE_ENTRIES = 100
const MAX_CHAPTER_CACHE_ENTRIES = 2000
const MIN_CHAPTER_CACHE_TTL_MS = 1000 * 60 * 60 * 6
const MAX_CHAPTER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export async function estimateBrowserStorage():
  Promise<BrowserStorageEstimate | null> {
  if (!navigator.storage?.estimate) {
    return null
  }

  const estimate = await navigator.storage.estimate()
  return {
    used: estimate.usage || 0,
    quota: estimate.quota || 0,
  }
}

export async function requestPersistentBrowserStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist || !navigator.storage?.persisted) {
    return null
  }

  const isPersisted = await navigator.storage.persisted()
  if (isPersisted) {
    return true
  }

  return await navigator.storage.persist()
}

export function deriveChapterCachePolicyFromStorage(
  estimate: BrowserStorageEstimate | null
): ChapterCachePolicy | null {
  if (!estimate || estimate.quota <= 0 || !Number.isFinite(estimate.quota)) {
    return null
  }

  const used = Math.max(0, estimate.used || 0)
  const quota = Math.max(0, estimate.quota)
  const quotaGiB = quota / (1024 ** 3)
  const usageRatio = quota > 0 ? used / quota : 0

  let maxEntries = 600
  let ttlMs = 1000 * 60 * 60 * 24 * 7

  if (quotaGiB < 1) {
    maxEntries = 220
    ttlMs = 1000 * 60 * 60 * 24
  } else if (quotaGiB < 2) {
    maxEntries = 320
    ttlMs = 1000 * 60 * 60 * 24 * 2
  } else if (quotaGiB < 4) {
    maxEntries = 460
    ttlMs = 1000 * 60 * 60 * 24 * 4
  } else if (quotaGiB < 8) {
    maxEntries = 680
    ttlMs = 1000 * 60 * 60 * 24 * 7
  } else {
    maxEntries = 900
    ttlMs = 1000 * 60 * 60 * 24 * 12
  }

  if (usageRatio > 0.85) {
    maxEntries = Math.floor(maxEntries * 0.65)
    ttlMs = Math.floor(ttlMs * 0.5)
  } else if (usageRatio > 0.7) {
    maxEntries = Math.floor(maxEntries * 0.82)
    ttlMs = Math.floor(ttlMs * 0.75)
  }

  return {
    maxEntries: Math.max(
      MIN_CHAPTER_CACHE_ENTRIES,
      Math.min(MAX_CHAPTER_CACHE_ENTRIES, Math.trunc(maxEntries))
    ),
    ttlMs: Math.max(MIN_CHAPTER_CACHE_TTL_MS, Math.min(MAX_CHAPTER_CACHE_TTL_MS, Math.trunc(ttlMs))),
  }
}

export function getLocalStorageItem(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }

  return localStorage.getItem(key)
}

export function setLocalStorageItem(key: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(key, value)
}

export function removeLocalStorageKey(key: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.removeItem(key)
}

export async function clearCachesByPatterns(patterns: readonly string[]): Promise<void> {
  if (typeof caches === 'undefined') {
    return
  }

  const cacheNames = await caches.keys()
  await Promise.all(
    cacheNames
      .filter(name => patterns.some(pattern => name.includes(pattern)))
      .map(name => caches.delete(name))
  )
}

export async function deleteIndexedDatabase(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

export async function deleteIndexedDatabases(names: readonly string[]): Promise<void> {
  await Promise.all(names.map(name => deleteIndexedDatabase(name)))
}

export function removeLocalStorageKeys(keys: readonly string[]): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  keys.forEach(key => {
    localStorage.removeItem(key)
  })
}

export function removeLocalStorageKeysByPrefix(prefix: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(prefix)) {
      localStorage.removeItem(key)
    }
  }
}

export function getSessionStorageItem(key: string): string | null {
  if (typeof sessionStorage === 'undefined') {
    return null
  }

  return sessionStorage.getItem(key)
}

export function setSessionStorageItem(key: string, value: string): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  sessionStorage.setItem(key, value)
}

export function removeSessionStorageKey(key: string): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  sessionStorage.removeItem(key)
}
