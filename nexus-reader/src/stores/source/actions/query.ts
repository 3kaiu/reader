import type { ApiResponse } from '@/api/http/types'
import { sourceApi } from '@/api/source'
import type {
  BookSource,
  RuntimeSnapshotExportResponse,
  RuntimeSnapshotImportResponse,
  RuntimeSnapshotSaveResponse,
  SourceCircuitStateResponse,
  SourceRuntimeResetResponse,
  SourceRuntimeProfileResponse,
} from '@/types/source'
import { toPrettyJson } from '@/utils/json'
import {
  filterSourcesByKeyword,
  toSourceDetailText,
} from '@/utils/sourceStore'
import type {
  SourceDetailTextResult,
  SourceStoreState,
} from '../types'

export function createSourceQueryActions(state: SourceStoreState) {
  function filterSources(keyword = '') {
    return filterSourcesByKeyword(state.sources.value, keyword)
  }

  function getSourcesByIds(ids: Iterable<string>) {
    const targetIds = new Set(Array.from(ids).filter(Boolean))
    if (targetIds.size === 0) {
      return []
    }

    return state.sources.value.filter(source => targetIds.has(source.id))
  }

  function getExportSources(
    ids?: Iterable<string>,
    fallback = state.sources.value,
  ) {
    const selectedSources = ids ? getSourcesByIds(ids) : []
    return selectedSources.length > 0 ? selectedSources : fallback
  }

  async function getSourceDetail(id: string): Promise<ApiResponse<BookSource>> {
    return sourceApi.getBookSource(id)
  }

  async function saveRuntimeSnapshot(): Promise<ApiResponse<RuntimeSnapshotSaveResponse>> {
    return sourceApi.saveRuntimeSnapshot()
  }

  async function exportRuntimeSnapshot(): Promise<ApiResponse<RuntimeSnapshotExportResponse>> {
    return sourceApi.exportRuntimeSnapshot()
  }

  async function importRuntimeSnapshot(
    payload: RuntimeSnapshotExportResponse,
  ): Promise<ApiResponse<RuntimeSnapshotImportResponse>> {
    return sourceApi.importRuntimeSnapshot(payload)
  }

  async function getSourceRuntimeProfile(
    id: string,
  ): Promise<ApiResponse<SourceRuntimeProfileResponse>> {
    return sourceApi.getSourceRuntimeProfile(id)
  }

  async function getSourceCircuitState(
    id: string,
  ): Promise<ApiResponse<SourceCircuitStateResponse>> {
    return sourceApi.getSourceCircuitState(id)
  }

  async function resetSourceRuntimeState(
    id: string,
    mode: 'full' | 'circuit_only' = 'full',
  ): Promise<ApiResponse<SourceRuntimeResetResponse>> {
    return sourceApi.resetSourceRuntimeState(id, mode)
  }

  async function getSourceDetailText(source: BookSource): Promise<SourceDetailTextResult> {
    const fallbackText = toSourceDetailText(source)
    if (!source.id) {
      return {
        text: fallbackText,
        isStale: false,
      }
    }

    try {
      const response = await getSourceDetail(source.id)
      if (response.isSuccess && response.data) {
        return {
          text: toPrettyJson(response.data, fallbackText),
          isStale: false,
        }
      }
    } catch {
      // fall through to stale fallback
    }

    return {
      text: fallbackText,
      isStale: true,
      errorMsg: '无法加载最新书源定义，已显示当前列表中的数据',
    }
  }

  return {
    filterSources,
    getSourcesByIds,
    getExportSources,
    getSourceDetail,
    saveRuntimeSnapshot,
    exportRuntimeSnapshot,
    importRuntimeSnapshot,
    getSourceRuntimeProfile,
    getSourceCircuitState,
    resetSourceRuntimeState,
    getSourceDetailText,
  }
}
