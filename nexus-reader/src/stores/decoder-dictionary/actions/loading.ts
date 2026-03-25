import { getDictionary } from '@/api/decoder'

interface DecoderDictionaryLoadingHelpers {
  applyEntries: (nextEntries: import('@/types/decoder').DictionaryEntry[]) => void
}

export function createDecoderDictionaryLoadingActions(
  state: import('../types').DecoderDictionaryStoreState,
  helpers: DecoderDictionaryLoadingHelpers,
) {
  let loadPromise: Promise<import('@/types/decoder').DictionaryEntry[]> | null = null

  async function loadEntries(force = false): Promise<import('@/types/decoder').DictionaryEntry[]> {
    if (loadPromise) {
      return loadPromise
    }

    if (state.loaded.value && !force) {
      return state.entries.value
    }

    state.loading.value = true
    loadPromise = getDictionary({ level: 'all' })
      .then(response => {
        helpers.applyEntries(response.entries || [])
        return state.entries.value
      })
      .finally(() => {
        state.loading.value = false
        loadPromise = null
      })

    return loadPromise
  }

  return {
    loadEntries,
  }
}
