const apiCacheMap = new Map<string, { data: unknown; timestamp: number }>()

export function clearApiResponseCache(): void {
  apiCacheMap.clear()
}
