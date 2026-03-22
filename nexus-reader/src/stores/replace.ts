import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { replaceApi } from '@/api/replace'
import type { ApiResponse } from '@/api/http/types'
import type { ReplaceRule } from '@/types/replace'
import {
  buildDeleteBatchSummary,
  getImportBatchStatus,
  normalizeBatchIds,
} from '@/utils/batchMutation'
import {
  filterReplaceRules,
  upsertRuleList,
} from '@/utils/replaceStore'
import {
  buildReplaceRuleFromDraft,
  createReplaceRuleDraft,
  getReplaceRuleKey,
  type ReplaceRuleDraft,
} from '@/utils/replaceRules'
import { parseReplaceRuleImport } from '@/utils/replaceImport'
import { toPrettyJson } from '@/utils/json'

export type ImportReplaceRulesResult = {
  status: 'imported' | 'partial' | 'failed'
  rules: ReplaceRule[]
  savedCount: number
  skippedCount: number
  normalizedText?: string
  errorMsg?: string
}

export type SaveReplaceRuleDraftResult = {
  status: 'saved' | 'invalid' | 'failed'
  rule?: ReplaceRule
  errorMsg?: string
}

export type DeleteReplaceRulesResult = {
  status: 'deleted' | 'partial' | 'failed'
  deletedCount: number
  failedCount: number
  deletedKeys: string[]
  remainingKeys: string[]
  errorMsg?: string
}

export const useReplaceStore = defineStore('replace', () => {
  const rules = ref<ReplaceRule[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  let loadPromise: Promise<ApiResponse<ReplaceRule[]>> | null = null

  const enabledCount = computed(() => rules.value.filter(rule => rule.isEnabled).length)

  async function loadRules(force = false): Promise<ApiResponse<ReplaceRule[]>> {
    if (loadPromise) {
      return loadPromise
    }

    if (loaded.value && !force) {
      return {
        isSuccess: true,
        data: rules.value,
      }
    }

    loading.value = true
    loadPromise = replaceApi
      .getReplaceRules()
      .then(response => {
        rules.value = response.isSuccess ? response.data || [] : []
        loaded.value = true
        return response
      })
      .finally(() => {
        loading.value = false
        loadPromise = null
      })

    return loadPromise
  }

  async function saveRule(rule: ReplaceRule): Promise<ApiResponse<ReplaceRule>> {
    const response = await replaceApi.saveReplaceRule(rule)
    if (response.isSuccess && response.data) {
      rules.value = upsertRuleList(rules.value, [response.data])
    }
    return response
  }

  function filterRules(keyword = ''): ReplaceRule[] {
    return filterReplaceRules(rules.value, keyword)
  }

  function getRulesByKeys(keys: Iterable<string>): ReplaceRule[] {
    const targetKeys = new Set(Array.from(keys).filter(Boolean))
    if (targetKeys.size === 0) {
      return []
    }

    return rules.value.filter(rule => targetKeys.has(getReplaceRuleKey(rule)))
  }

  function getExportRules(
    keys?: Iterable<string>,
    fallback: ReplaceRule[] = rules.value
  ): ReplaceRule[] {
    const selectedRules = keys ? getRulesByKeys(keys) : []
    return selectedRules.length > 0 ? selectedRules : fallback
  }

  function createRuleDraft(rule?: Partial<ReplaceRule> | null): ReplaceRuleDraft {
    return createReplaceRuleDraft(rule)
  }

  async function saveRuleDraft(
    draft: Partial<ReplaceRuleDraft>
  ): Promise<SaveReplaceRuleDraftResult> {
    const rule = buildReplaceRuleFromDraft(draft)
    if (!rule) {
      return {
        status: 'invalid',
        errorMsg: !String(draft.name || '').trim() ? '请输入规则名称' : '请输入替换规则',
      }
    }

    const response = await saveRule(rule)
    if (!response.isSuccess) {
      return {
        status: 'failed',
        rule,
        errorMsg: response.errorMsg || '保存失败',
      }
    }

    return {
      status: 'saved',
      rule: response.data || rule,
    }
  }

  async function saveRules(batch: ReplaceRule[]): Promise<ApiResponse<ReplaceRule[]>> {
    const response = await replaceApi.saveReplaceRules(batch)
    if ((response.data || []).length > 0) {
      rules.value = upsertRuleList(rules.value, response.data || [])
    }
    return response
  }

  async function importRulesFromText(text: string): Promise<ImportReplaceRulesResult> {
    const parsed = parseReplaceRuleImport(text)
    if (!parsed.success) {
      return {
        status: 'failed',
        rules: [],
        savedCount: 0,
        skippedCount: parsed.skippedCount,
        errorMsg: parsed.error || '导入失败',
      }
    }

    const response = await saveRules(parsed.rules)
    const savedCount = (response.data || []).length

    return {
      status: getImportBatchStatus(savedCount, parsed.rules.length),
      rules: parsed.rules,
      savedCount,
      skippedCount: parsed.skippedCount,
      normalizedText: toPrettyJson(parsed.rules),
      errorMsg:
        response.isSuccess
          ? undefined
          : response.errorMsg || (savedCount > 0 ? '部分规则导入失败' : '导入失败'),
    }
  }

  async function deleteRules(targetRules: ReplaceRule[]): Promise<ApiResponse<ReplaceRule[]>> {
    const response = await replaceApi.deleteReplaceRules(targetRules)
    const deletedRules = response.data || []

    if (deletedRules.length > 0) {
      const deletedKeys = new Set(deletedRules.map(getReplaceRuleKey))
      rules.value = rules.value.filter(rule => !deletedKeys.has(getReplaceRuleKey(rule)))
    }
    return response
  }

  async function deleteRulesByKeys(
    keys: Iterable<string>
  ): Promise<DeleteReplaceRulesResult> {
    const targetKeys = normalizeBatchIds(keys)
    const targetRules = getRulesByKeys(targetKeys)
    if (targetRules.length === 0) {
      return {
        status: 'deleted',
        deletedCount: 0,
        failedCount: 0,
        deletedKeys: [],
        remainingKeys: [],
      }
    }

    const response = await deleteRules(targetRules)
    const summary = buildDeleteBatchSummary(
      targetKeys,
      (response.data || []).map(getReplaceRuleKey),
      response.errorMsg
    )

    return {
      status: summary.status,
      deletedCount: summary.deletedCount,
      failedCount: summary.failedCount,
      deletedKeys: summary.deletedIds,
      remainingKeys: summary.remainingIds,
      errorMsg: summary.errorMsg,
    }
  }

  async function setRuleEnabled(
    rule: ReplaceRule,
    enabled: boolean
  ): Promise<ApiResponse<ReplaceRule>> {
    const ruleKey = getReplaceRuleKey(rule)
    const previousRule = rules.value.find(item => getReplaceRuleKey(item) === ruleKey)
    const previousValue = previousRule?.isEnabled ?? rule.isEnabled

    rules.value = rules.value.map(item =>
      getReplaceRuleKey(item) === ruleKey
        ? {
            ...item,
            isEnabled: enabled,
          }
        : item
    )

    const response = await replaceApi.saveReplaceRule({
      ...rule,
      isEnabled: enabled,
    })

    if (response.isSuccess && response.data) {
      rules.value = upsertRuleList(rules.value, [response.data])
      return response
    }

    rules.value = rules.value.map(item =>
      getReplaceRuleKey(item) === ruleKey
        ? {
            ...item,
            isEnabled: previousValue,
          }
        : item
    )

    return response
  }

  return {
    rules,
    loading,
    loaded,
    enabledCount,
    loadRules,
    filterRules,
    getRulesByKeys,
    getExportRules,
    createRuleDraft,
    saveRule,
    saveRuleDraft,
    saveRules,
    importRulesFromText,
    deleteRulesByKeys,
    setRuleEnabled,
  }
})
