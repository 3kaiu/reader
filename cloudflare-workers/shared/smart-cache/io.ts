export function serializeSmartCacheValue<T>(value: T): string {
  return JSON.stringify(value)
}

export function deserializeSmartCacheValue<T>(body: string): T {
  try {
    return JSON.parse(body) as T
  } catch {
    return body as T
  }
}
