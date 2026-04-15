import { onMounted, onUnmounted } from 'vue'
import {
  getSessionStorageItem,
  removeSessionStorageKey,
  setSessionStorageItem,
} from '@/utils/browserStorage'
import { logger } from '@/utils/logger'
import { useLibraryStore } from '@/stores/library'
import { useSearchStore } from '@/stores/search'
import { useSourceStore } from '@/stores/source'

const SEARCH_RESET_STORAGE_KEY = 'search-should-reset'

export function useSearchSession(options: {
  searchStore: ReturnType<typeof useSearchStore>
  libraryStore: ReturnType<typeof useLibraryStore>
  sourceStore: ReturnType<typeof useSourceStore>
}) {
  onMounted(async () => {
    const shouldReset = getSessionStorageItem(SEARCH_RESET_STORAGE_KEY)
    if (shouldReset === 'true') {
      options.searchStore.reset()
      removeSessionStorageKey(SEARCH_RESET_STORAGE_KEY)
    }

    try {
      await options.libraryStore.loadBooks()
    } catch (cause) {
      logger.error('Failed to load bookshelf', { error: cause })
    }

    try {
      await options.sourceStore.loadSources()
    } catch (cause) {
      logger.error('Failed to load sources', { error: cause })
    }
  })

  onUnmounted(() => {
    options.searchStore.stopSearch()
    setSessionStorageItem(SEARCH_RESET_STORAGE_KEY, 'true')
  })
}
