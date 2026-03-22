import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { sourceApi } from '@/api/source'
import type { ApiResponse } from '@/api/http/types'
import type { BookSource } from '@/types/source'
import {
  buildDeleteBatchSummary,
  collectSettledSuccessIds,
  countSettledSuccesses,
  getImportBatchStatus,
  getSettledApiError,
  normalizeBatchIds,
} from '@/utils/batchMutation'
import { parseSourceImportText } from '@/utils/sourceImport'
import { toPrettyJson } from '@/utils/json'
import {
  buildSourceGroups,
  filterSourcesByKeyword,
  normalizeSource,
  toImportedSourceText,
  toSourceDetailText,
  type SourceDefinition,
  type SourceListEntry,
} from '@/utils/sourceStore'

export type SourceListItem = SourceListEntry

export type ImportSourcesResult = {
  status: 'imported' | 'partial' | 'failed'
  successCount: number
  totalCount: number
  errorMsg?: string
}

export type ImportSourceTextResult = ImportSourcesResult & {
  normalizedText?: string
}

export type SourceDetailTextResult = {
  text: string
  isStale: boolean
  errorMsg?: string
}

export type DeleteSourcesResult = {
  status: 'deleted' | 'partial' | 'failed'
  deletedCount: number
  failedCount: number
  deletedIds: string[]
  remainingIds: string[]
  errorMsg?: string
}

export const useSourceStore = defineStore('source', () => {
  const sources = ref<SourceListItem[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  let loadPromise: Promise<ApiResponse<BookSource[]>> | null = null

  const enabledCount = computed(
    () => sources.value.filter(source => source.enabled !== false).length
  )

  const groups = computed(() => buildSourceGroups(sources.value))

  async function loadSources(force = false): Promise<ApiResponse<BookSource[]>> {
    if (loadPromise) {
      return loadPromise
    }

    if (loaded.value && !force) {
      return {
        isSuccess: true,
        data: sources.value,
      }
    }

    loading.value = true
    loadPromise = sourceApi
      .getBookSources()
      .then(response => {
        sources.value = response.isSuccess
          ? (response.data || []).map(normalizeSource)
          : []
        loaded.value = true
        return response
      })
      .finally(() => {
        loading.value = false
        loadPromise = null
      })

    return loadPromise
  }

  async function updateSourceStatus(id: string, enabled: boolean): Promise<ApiResponse<BookSource>> {
    const response = await sourceApi.updateSourceStatus(id, enabled)
    if (response.isSuccess) {
      sources.value = sources.value.map(source =>
        source.id === id
          ? {
              ...source,
              enabled,
            }
          : source
      )
    }
    return response
  }

  async function setSourceEnabled(id: string, enabled: boolean): Promise<ApiResponse<BookSource>> {
    const currentSource = sources.value.find(source => source.id === id)
    const previousEnabled = currentSource?.enabled

    if (typeof previousEnabled === 'boolean') {
      sources.value = sources.value.map(source =>
        source.id === id
          ? {
              ...source,
              enabled,
            }
          : source
      )
    }

    const response = await sourceApi.updateSourceStatus(id, enabled)

    if (response.isSuccess) {
      return response
    }

    if (typeof previousEnabled === 'boolean') {
      sources.value = sources.value.map(source =>
        source.id === id
          ? {
              ...source,
              enabled: previousEnabled,
            }
          : source
      )
    }

    return response
  }

  function filterSources(keyword = ''): SourceListItem[] {
    return filterSourcesByKeyword(sources.value, keyword)
  }

  function getSourcesByIds(ids: Iterable<string>): SourceListItem[] {
    const targetIds = new Set(Array.from(ids).filter(Boolean))
    if (targetIds.size === 0) {
      return []
    }

    return sources.value.filter(source => targetIds.has(source.id))
  }

  function getExportSources(
    ids?: Iterable<string>,
    fallback: SourceListItem[] = sources.value
  ): SourceListItem[] {
    const selectedSources = ids ? getSourcesByIds(ids) : []
    return selectedSources.length > 0 ? selectedSources : fallback
  }

  async function getSourceDetail(id: string): Promise<ApiResponse<BookSource>> {
    return sourceApi.getBookSource(id)
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

  async function importSources(sourcesToImport: SourceDefinition[]): Promise<ImportSourcesResult> {
    const targets = sourcesToImport.filter(source => Boolean(source))
    if (targets.length === 0) {
      return {
        status: 'failed',
        successCount: 0,
        totalCount: 0,
        errorMsg: '未找到有效书源',
      }
    }

    const results = await Promise.allSettled(
      targets.map(source => sourceApi.addSource(source))
    )

    const successCount = countSettledSuccesses(results)

    if (successCount > 0) {
      await loadSources(true)
    }

    return {
      status: getImportBatchStatus(successCount, targets.length),
      successCount,
      totalCount: targets.length,
      errorMsg: getSettledApiError(results, '部分书源导入失败'),
    }
  }

  async function importSourceText(text: string): Promise<ImportSourceTextResult> {
    const parsed = parseSourceImportText(text)
    if (!parsed.success) {
      return {
        status: 'failed',
        successCount: 0,
        totalCount: 0,
        errorMsg: parsed.error || '解析失败',
      }
    }

    const result = await importSources(parsed.sources)

    return {
      ...result,
      normalizedText: toImportedSourceText(parsed.sources),
    }
  }

  async function deleteSources(ids: string[]): Promise<ApiResponse<string[]>> {
    const targetIds = normalizeBatchIds(ids)

    if (targetIds.length === 0) {
      return {
        isSuccess: true,
        data: [],
      }
    }

    const results = await Promise.allSettled(
      targetIds.map(id => sourceApi.deleteBookSource(id))
    )

    const deletedIds = collectSettledSuccessIds(targetIds, results)

    if (deletedIds.length > 0) {
      const deletedIdSet = new Set(deletedIds)
      sources.value = sources.value.filter(source => !deletedIdSet.has(source.id))
    }

    return {
      isSuccess: deletedIds.length === targetIds.length,
      data: deletedIds,
      errorMsg: getSettledApiError(results, '部分书源删除失败'),
    }
  }

  async function deleteSourceIds(ids: Iterable<string>): Promise<DeleteSourcesResult> {
    const targetIds = normalizeBatchIds(ids)
    const response = await deleteSources(targetIds)
    return buildDeleteBatchSummary(targetIds, response.data || [], response.errorMsg)
  }

  return {
    sources,
    loading,
    loaded,
    enabledCount,
    groups,
    loadSources,
    updateSourceStatus,
    setSourceEnabled,
    filterSources,
    getSourcesByIds,
    getExportSources,
    getSourceDetail,
    getSourceDetailText,
    importSources,
    importSourceText,
    deleteSourceIds,
  }
})
