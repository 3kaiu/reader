export type BrowserStorageEstimate = {
  used: number
  quota: number
}

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
