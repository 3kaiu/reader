import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ApiResponse } from '@/api/http/types'
import { aiApi } from '@/api/ai'
import type { AiAnalysisHistory, AiMappingRule } from '@/types/ai-analysis'
import { getImportBatchStatus } from '@/utils/batchMutation'
import {
  filterAiMappings,
  getAiMappingStats,
  type AiMappingFilterType,
} from '@/utils/aiAnalysisStore'
import {
  buildAiMappingRuleFromDraft,
  createAiMappingDraft,
  type AiMappingDraft,
  parseImportedAiMappingText,
  toAiMappingTransferRule,
  type AiMappingTransferRule,
} from '@/utils/aiAnalysisTransfer'

type HydrateResult = {
  mappings: ApiResponse<AiMappingRule[]>
  history: ApiResponse<AiAnalysisHistory[]>
}

export type ImportAiMappingsResult = {
  status: 'imported' | 'partial' | 'failed'
  importedCount: number
  totalCount: number
  skippedCount: number
  errorMsg?: string
}

export type SaveAiMappingDraftResult = {
  status: 'saved' | 'invalid' | 'failed'
  rule?: AiMappingRule
  errorMsg?: string
}

export const useAiAnalysisStore = defineStore('ai-analysis', () => {
  const mappings = ref<AiMappingRule[]>([])
  const history = ref<AiAnalysisHistory[]>([])
  const loading = ref(false)
  const mappingsLoaded = ref(false)
  const historyLoaded = ref(false)
  const searchKeyword = ref('')
  const filterType = ref<AiMappingFilterType>('all')

  let mappingsLoadPromise: Promise<ApiResponse<AiMappingRule[]>> | null = null
  let historyLoadPromise: Promise<ApiResponse<AiAnalysisHistory[]>> | null = null
  let hydratePromise: Promise<HydrateResult> | null = null

  const displayMappings = computed(() =>
    filterAiMappings(mappings.value, filterType.value, searchKeyword.value)
  )

  const stats = computed(() => getAiMappingStats(mappings.value))

  async function loadMappings(force = false): Promise<ApiResponse<AiMappingRule[]>> {
    if (mappingsLoadPromise) {
      return mappingsLoadPromise
    }

    if (mappingsLoaded.value && !force) {
      return {
        isSuccess: true,
        data: mappings.value,
      }
    }

    mappingsLoadPromise = aiApi
      .getMappings()
      .then(response => {
        mappings.value = response.isSuccess && Array.isArray(response.data) ? response.data : []
        mappingsLoaded.value = true
        return response
      })
      .finally(() => {
        mappingsLoadPromise = null
      })

    return mappingsLoadPromise
  }

  async function loadHistory(
    force = false,
    limit?: number
  ): Promise<ApiResponse<AiAnalysisHistory[]>> {
    if (historyLoadPromise) {
      return historyLoadPromise
    }

    if (historyLoaded.value && !force && typeof limit === 'undefined') {
      return {
        isSuccess: true,
        data: history.value,
      }
    }

    historyLoadPromise = aiApi
      .getHistory(limit)
      .then(response => {
        history.value = response.isSuccess && Array.isArray(response.data) ? response.data : []
        if (typeof limit === 'undefined') {
          historyLoaded.value = true
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

    loading.value = true
    hydratePromise = Promise.all([
      loadMappings(force),
      loadHistory(force),
    ])
      .then(([mappingsResponse, historyResponse]) => ({
        mappings: mappingsResponse,
        history: historyResponse,
      }))
      .finally(() => {
        loading.value = false
        hydratePromise = null
      })

    return hydratePromise
  }

  async function saveMapping(rule: AiMappingRule): Promise<ApiResponse<void>> {
    const response = await aiApi.saveMapping(rule)
    if (response.isSuccess) {
      await loadMappings(true)
    }
    return response
  }

  function createMappingDraft(rule?: Partial<AiMappingRule> | null): AiMappingDraft {
    return createAiMappingDraft(rule)
  }

  async function saveMappingDraft(
    draft: Partial<AiMappingDraft>,
    existingRule?: AiMappingRule | null
  ): Promise<SaveAiMappingDraftResult> {
    const rule = buildAiMappingRuleFromDraft(draft, existingRule)
    if (!rule) {
      return {
        status: 'invalid',
        errorMsg: '请填写完整信息',
      }
    }

    const response = await saveMapping(rule)
    if (!response.isSuccess) {
      return {
        status: 'failed',
        rule,
        errorMsg: response.errorMsg || '保存失败',
      }
    }

    return {
      status: 'saved',
      rule,
    }
  }

  async function deleteMapping(id: string): Promise<ApiResponse<void>> {
    const response = await aiApi.deleteMapping(id)
    if (response.isSuccess) {
      mappings.value = mappings.value.filter(mapping => mapping.id !== id)
    }
    return response
  }

  async function setMappingEnabled(
    rule: AiMappingRule,
    enabled: boolean
  ): Promise<ApiResponse<void>> {
    return saveMapping({
      ...rule,
      enabled,
    })
  }

  function exportMappings(): AiMappingTransferRule[] {
    return mappings.value.map(toAiMappingTransferRule)
  }

  async function importMappings(rules: AiMappingRule[]): Promise<ImportAiMappingsResult> {
    if (rules.length === 0) {
      return {
        status: 'failed',
        importedCount: 0,
        totalCount: 0,
        skippedCount: 0,
        errorMsg: '未找到有效的映射规则',
      }
    }

    let importedCount = 0
    let lastError: string | undefined

    for (const rule of rules) {
      const response = await aiApi.saveMapping(rule)
      if (!response.isSuccess) {
        lastError = response.errorMsg || `保存映射规则失败: ${rule.original}`
        continue
      }

      importedCount += 1
    }

    if (importedCount > 0) {
      await loadMappings(true)
    }

    return {
      status: getImportBatchStatus(importedCount, rules.length),
      importedCount,
      totalCount: rules.length,
      skippedCount: 0,
      errorMsg: lastError,
    }
  }

  async function importMappingsFromText(text: string): Promise<ImportAiMappingsResult> {
    const parsed = parseImportedAiMappingText(text)
    if (!parsed.success) {
      return {
        status: 'failed',
        importedCount: 0,
        totalCount: 0,
        skippedCount: 0,
        errorMsg: parsed.error || '导入失败',
      }
    }

    if (parsed.rules.length === 0) {
      return {
        status: 'failed',
        importedCount: 0,
        totalCount: parsed.totalCount,
        skippedCount: parsed.skippedCount,
        errorMsg: '未找到有效的映射规则',
      }
    }

    const result = await importMappings(parsed.rules)

    return {
      ...result,
      status: getImportBatchStatus(result.importedCount, parsed.totalCount),
      totalCount: parsed.totalCount,
      skippedCount: parsed.skippedCount + (parsed.rules.length - result.importedCount),
    }
  }

  async function clearHistory(): Promise<ApiResponse<void>> {
    const response = await aiApi.clearHistory()
    if (response.isSuccess) {
      history.value = []
      historyLoaded.value = true
    }
    return response
  }

  function resetFilters(): void {
    searchKeyword.value = ''
    filterType.value = 'all'
  }

  return {
    mappings,
    history,
    loading,
    mappingsLoaded,
    historyLoaded,
    searchKeyword,
    filterType,
    displayMappings,
    stats,
    loadMappings,
    loadHistory,
    hydrate,
    createMappingDraft,
    saveMapping,
    saveMappingDraft,
    deleteMapping,
    setMappingEnabled,
    exportMappings,
    importMappings,
    importMappingsFromText,
    clearHistory,
    resetFilters,
  }
})
