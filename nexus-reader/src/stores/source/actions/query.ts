import type { ApiResponse } from '@/api/http/types'
import { sourceApi } from '@/api/source'
import type { BookSource } from '@/types/source'
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
    getSourceDetailText,
  }
}
