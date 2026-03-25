import { ref } from 'vue'
import type { AiAnalysisStoreState } from './types'

export function createAiAnalysisStoreState(): AiAnalysisStoreState {
  return {
    mappings: ref([]),
    history: ref([]),
    loading: ref(false),
    mappingsLoaded: ref(false),
    historyLoaded: ref(false),
    searchKeyword: ref(''),
    filterType: ref('all'),
  }
}
