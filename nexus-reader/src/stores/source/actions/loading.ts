import type { ApiResponse } from '@/api/http/types'
import { sourceApi } from '@/api/source'
import type {
  BookSource,
  SourceHealthSummary,
  SourcePolicy,
} from '@/types/source'
import {
  normalizeSource,
  sortSourcesByBusinessPriority,
} from '@/utils/sourceStore'
import type { SourceStoreState } from '../types'

export function createSourceLoadingActions(state: SourceStoreState) {
  let loadPromise: Promise<ApiResponse<BookSource[]>> | null = null

  function mergeHealthIntoSources(healthItems: SourceHealthSummary[]): void {
    if (healthItems.length === 0) {
      return
    }

    const healthMap = new Map(healthItems.map(item => [item.sourceId, item] as const))
    state.sources.value = sortSourcesByBusinessPriority(
      state.sources.value.map(source => ({
        ...source,
        health: healthMap.get(source.id) || source.health,
      })),
    )
  }

  function applySource(source: BookSource): void {
    const normalizedSource = normalizeSource(source)
    const existingIndex = state.sources.value.findIndex(
      source => source.id === normalizedSource.id,
    )

    if (existingIndex >= 0) {
      const next = [...state.sources.value]
      next[existingIndex] = {
        ...next[existingIndex],
        ...normalizedSource,
      }
      state.sources.value = sortSourcesByBusinessPriority(next)
      return
    }

    state.sources.value = sortSourcesByBusinessPriority([
      ...state.sources.value,
      normalizedSource,
    ])
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
    loadPromise = Promise.all([
      sourceApi.getBookSources(),
      sourceApi.getSourceHealth().catch(() => null),
    ])
      .then(([response, healthResponse]) => {
        state.sources.value = response.isSuccess
          ? sortSourcesByBusinessPriority((response.data || []).map(normalizeSource))
          : []
        if (healthResponse?.isSuccess && Array.isArray(healthResponse.data)) {
          mergeHealthIntoSources(healthResponse.data)
        }
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
    if (response.isSuccess && response.data) {
      applySource(response.data)
    }
    return response
  }

  async function updateSourcePolicy(
    id: string,
    policy: SourcePolicy,
  ): Promise<ApiResponse<BookSource>> {
    const response = await sourceApi.updateSourcePolicy(id, policy)
    if (response.isSuccess && response.data) {
      applySource(response.data)
    }
    return response
  }

  async function setSourceEnabled(
    id: string,
    enabled: boolean,
  ): Promise<ApiResponse<BookSource>> {
    const currentSource = state.sources.value.find(source => source.id === id)
    const previousSource = currentSource ? { ...currentSource } : undefined

    if (previousSource) {
      applySource({
        ...previousSource,
        enabled,
      })
    }

    const response = await sourceApi.updateSourceStatus(id, enabled)

    if (response.isSuccess && response.data) {
      applySource(response.data)
      return response
    }

    if (previousSource) {
      applySource(previousSource)
    }

    return response
  }

  return {
    loadSources,
    updateSourceStatus,
    updateSourcePolicy,
    setSourceEnabled,
  }
}
