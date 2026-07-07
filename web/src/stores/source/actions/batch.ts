import type { ApiResponse } from '@/api/http/types'
import { sourceApi } from '@/api/source'
import {
  buildDeleteBatchSummary,
  collectSettledSuccessIds,
  countSettledSuccesses,
  getImportBatchStatus,
  getSettledApiError,
  normalizeBatchIds,
} from '@/utils/batchMutation'
import { parseSourceImportText } from '@/utils/sourceImport'
import { toImportedSourceText, type SourceDefinition } from '@/stores/source/helpers'
import type {
  DeleteSourcesResult,
  ImportSourceTextResult,
  ImportSourcesResult,
  SourceStoreState,
} from '../types'

interface SourceBatchHelpers {
  loadSources: (force?: boolean) => Promise<ApiResponse<unknown>>
}

export function createSourceBatchActions(state: SourceStoreState, helpers: SourceBatchHelpers) {
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

    const results = await Promise.allSettled(targets.map(source => sourceApi.addSource(source)))

    const successCount = countSettledSuccesses(results)

    if (successCount > 0) {
      await helpers.loadSources(true)
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

    const results = await Promise.allSettled(targetIds.map(id => sourceApi.deleteBookSource(id)))

    const deletedIds = collectSettledSuccessIds(targetIds, results)

    if (deletedIds.length > 0) {
      const deletedIdSet = new Set(deletedIds)
      state.sources.value = state.sources.value.filter(source => !deletedIdSet.has(source.id))
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
    importSources,
    importSourceText,
    deleteSourceIds,
  }
}
