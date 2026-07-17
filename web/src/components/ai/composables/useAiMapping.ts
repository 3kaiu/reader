import { ref } from 'vue'
import type { AliasMapping } from './types'
import { $get, $put } from '@/api/client'

/**
 * CRUD operations for the AI mapping knowledge base.
 */
export function useAiMapping(bookId: string) {
  const mappings = ref<AliasMapping[]>([])
  const isLoading = ref(false)

  async function fetchMappings() {
    isLoading.value = true
    try {
      const resp = await $get<AliasMapping[]>(`/api/ai/mapping?bookId=${bookId}`)
      if (resp.isSuccess) mappings.value = resp.data
    } finally {
      isLoading.value = false
    }
  }

  async function upsertMapping(mapping: AliasMapping) {
    await $put('/api/ai/mapping', mapping)
    const idx = mappings.value.findIndex((m) => m.id === mapping.id)
    if (idx >= 0) {
      mappings.value[idx] = mapping
    } else {
      mappings.value.push(mapping)
    }
  }

  function removeMapping(id: string) {
    mappings.value = mappings.value.filter((m) => m.id !== id)
  }

  function exportAsJson(): string {
    return JSON.stringify(mappings.value, null, 2)
  }

  function importFromJson(json: string) {
    const imported = JSON.parse(json) as AliasMapping[]
    for (const m of imported) {
      const idx = mappings.value.findIndex(
        (existing) => existing.alias === m.alias
      )
      if (idx >= 0) {
        mappings.value[idx] = m
      } else {
        mappings.value.push(m)
      }
    }
  }

  return {
    mappings,
    isLoading,
    fetchMappings,
    upsertMapping,
    removeMapping,
    exportAsJson,
    importFromJson,
  }
}
