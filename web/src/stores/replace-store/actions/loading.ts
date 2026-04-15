import type { ApiResponse } from '@/api/http/types'
import { replaceApi } from '@/api/replace'
import type { ReplaceRule } from '@/types/replace'
import type { ReplaceStoreState } from '../types'

interface ReplaceLoadingHelpers {
  markRulesLoaded: (nextRules: ReplaceRule[]) => void
}

export function createReplaceLoadingActions(
  state: ReplaceStoreState,
  helpers: ReplaceLoadingHelpers
) {
  let loadPromise: Promise<ApiResponse<ReplaceRule[]>> | null = null

  async function loadRules(force = false): Promise<ApiResponse<ReplaceRule[]>> {
    if (loadPromise) {
      return loadPromise
    }

    if (state.loaded.value && !force) {
      return {
        isSuccess: true,
        data: state.rules.value,
      }
    }

    state.loading.value = true
    loadPromise = replaceApi
      .getReplaceRules()
      .then(response => {
        helpers.markRulesLoaded(response.isSuccess ? response.data || [] : [])
        return response
      })
      .finally(() => {
        state.loading.value = false
        loadPromise = null
      })

    return loadPromise
  }

  return {
    loadRules,
  }
}
