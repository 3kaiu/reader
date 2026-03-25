import type { ApiResponse } from '@/api/http/types'
import { aiApi } from '@/api/ai'
import type { AiAnalysisHistory, AiMappingRule } from '@/types/ai-analysis'
import type {
  AiAnalysisStoreState,
  HydrateResult,
} from '../types'

export function createAiAnalysisLoadingActions(state: AiAnalysisStoreState) {
  let mappingsLoadPromise: Promise<ApiResponse<AiMappingRule[]>> | null = null
  let historyLoadPromise: Promise<ApiResponse<AiAnalysisHistory[]>> | null = null
  let hydratePromise: Promise<HydrateResult> | null = null

  async function loadMappings(force = false): Promise<ApiResponse<AiMappingRule[]>> {
    if (mappingsLoadPromise) {
      return mappingsLoadPromise
    }

    if (state.mappingsLoaded.value && !force) {
      return {
        isSuccess: true,
        data: state.mappings.value,
      }
    }

    mappingsLoadPromise = aiApi
      .getMappings()
      .then(response => {
        state.mappings.value =
          response.isSuccess && Array.isArray(response.data) ? response.data : []
        state.mappingsLoaded.value = true
        return response
      })
      .finally(() => {
        mappingsLoadPromise = null
      })

    return mappingsLoadPromise
  }

  async function loadHistory(
    force = false,
    limit?: number,
  ): Promise<ApiResponse<AiAnalysisHistory[]>> {
    if (historyLoadPromise) {
      return historyLoadPromise
    }

    if (state.historyLoaded.value && !force && typeof limit === 'undefined') {
      return {
        isSuccess: true,
        data: state.history.value,
      }
    }

    historyLoadPromise = aiApi
      .getHistory(limit)
      .then(response => {
        state.history.value =
          response.isSuccess && Array.isArray(response.data) ? response.data : []
        if (typeof limit === 'undefined') {
          state.historyLoaded.value = true
        }
        return response
      })
      .finally(() => {
        historyLoadPromise = null
      })

    return historyLoadPromise
  }

  async function hydrate(force = false): Promise<HydrateResult> {
    if (hydratePromise) {
      return hydratePromise
    }

    state.loading.value = true
    hydratePromise = Promise.all([
      loadMappings(force),
      loadHistory(force),
    ])
      .then(([mappingsResponse, historyResponse]) => ({
        mappings: mappingsResponse,
        history: historyResponse,
      }))
      .finally(() => {
        state.loading.value = false
        hydratePromise = null
      })

    return hydratePromise
  }

  return {
    loadMappings,
    loadHistory,
    hydrate,
  }
}
