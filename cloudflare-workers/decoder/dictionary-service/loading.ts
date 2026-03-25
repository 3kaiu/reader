import type { DictionaryEntry, WorkerEnv } from '../../shared/types.ts'
import { OptimizedDictionaryIndex } from './index.ts'

function sortAndLimitEntries(entries: DictionaryEntry[], limit: number): DictionaryEntry[] {
  return [...entries]
    .sort((a, b) => (b.confirmCount || 0) - (a.confirmCount || 0))
    .slice(0, limit)
}

export async function loadDictionaryIndex(
  env: WorkerEnv,
  key: string,
  limit: number
): Promise<OptimizedDictionaryIndex | null> {
  const data = await env.DECODER_KV?.get(key)
  if (!data) {
    return null
  }

  const entries: DictionaryEntry[] = JSON.parse(data)
  const index = new OptimizedDictionaryIndex()

  for (const entry of sortAndLimitEntries(entries, limit)) {
    index.addEntry(entry)
  }

  return index
}
