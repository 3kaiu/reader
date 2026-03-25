import type { ApiResponse } from '@/api/http/types'
import { sourceApi } from '@/api/source'
import type { BookSource } from '@/types/source'
import { normalizeSource } from '@/utils/sourceStore'
import type { SourceStoreState } from '../types'

export function createSourceLoadingActions(state: SourceStoreState) {
  let loadPromise: Promise<ApiResponse<BookSource[]>> | null = null

  function applySourceEnabled(id: string, enabled: boolean): void {
    state.sources.value = state.sources.value.map(source =>
      source.id === id
        ? {
            ...source,
            enabled,
          }
        : source,
    )
  }

  async function loadSources(force = false): Promise<ApiResponse<BookSource[]>> {
    if (loadPromise) {
      return loadPromise
    }

    if (state.loaded.value && !force) {
      return {
        isSuccess: true,
        data: state.sources.value,
      }
    }

    state.loading.value = true
    loadPromise = sourceApi
      .getBookSources()
      .then(response => {
        state.sources.value = response.isSuccess
          ? (response.data || []).map(normalizeSource)
          : []
        state.loaded.value = true
        return response
      })
      .finally(() => {
        state.loading.value = false
        loadPromise = null
      })

    return loadPromise
  }

  async function updateSourceStatus(
    id: string,
    enabled: boolean,
  ): Promise<ApiResponse<BookSource>> {
    const response = await sourceApi.updateSourceStatus(id, enabled)
    if (response.isSuccess) {
      applySourceEnabled(id, enabled)
    }
    return response
  }

  async function setSourceEnabled(
    id: string,
    enabled: boolean,
  ): Promise<ApiResponse<BookSource>> {
    const currentSource = state.sources.value.find(source => source.id === id)
    const previousEnabled = currentSource?.enabled

    if (typeof previousEnabled === 'boolean') {
      applySourceEnabled(id, enabled)
    }

    const response = await sourceApi.updateSourceStatus(id, enabled)

    if (response.isSuccess) {
      return response
    }

    if (typeof previousEnabled === 'boolean') {
      applySourceEnabled(id, previousEnabled)
    }

    return response
  }

  return {
    loadSources,
    updateSourceStatus,
    setSourceEnabled,
  }
}
