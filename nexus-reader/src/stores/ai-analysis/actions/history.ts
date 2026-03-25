import type { ApiResponse } from '@/api/http/types'
import { aiApi } from '@/api/ai'
import type { AiAnalysisStoreState } from '../types'

export function createAiAnalysisHistoryActions(state: AiAnalysisStoreState) {
  async function clearHistory(): Promise<ApiResponse<void>> {
    const response = await aiApi.clearHistory()
    if (response.isSuccess) {
      state.history.value = []
      state.historyLoaded.value = true
    }
    return response
  }

  function resetFilters(): void {
    state.searchKeyword.value = ''
    state.filterType.value = 'all'
  }

  return {
    clearHistory,
    resetFilters,
  }
}
