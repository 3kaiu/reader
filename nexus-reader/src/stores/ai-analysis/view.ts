import { computed } from 'vue'
import {
  filterAiMappings,
  getAiMappingStats,
} from '@/utils/aiAnalysisStore'
import type { AiAnalysisStoreState, AiAnalysisStoreView } from './types'

export function createAiAnalysisStoreView(
  state: AiAnalysisStoreState
): AiAnalysisStoreView {
  return {
    displayMappings: computed(() =>
      filterAiMappings(
        state.mappings.value,
        state.filterType.value,
        state.searchKeyword.value
      )
    ),
    stats: computed(() => getAiMappingStats(state.mappings.value)),
  }
}
