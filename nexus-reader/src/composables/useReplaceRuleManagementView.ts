import { onMounted, ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useReplaceStore } from '@/stores/replace'
import type { ReplaceRule } from '@/types/replace'
import { getReplaceRuleKey } from '@/utils/replaceRules'
import { downloadJsonFile } from '@/utils/download'

type ReplaceRuleManagementSelection = {
  selectedRuleKeys: Ref<Set<string>>
  filteredRules: Ref<ReplaceRule[]>
  clearSelection: () => void
  setSelection: (keys: Iterable<string>) => void
  toggleManageMode: (force?: boolean) => void
}

export function useReplaceRuleManagementView(
  options: ReplaceRuleManagementSelection
) {
  const router = useRouter()
  const { success, error } = useMessage()
  const { confirm } = useConfirm()
  const { handleApiError, handlePromiseError } = useErrorHandler()
  const replaceStore = useReplaceStore()

  const showImport = ref(false)
  const showEdit = ref(false)
  const currentEditRule = ref<ReplaceRule | null>(null)

  async function loadRules() {
    options.clearSelection()

    try {
      const response = await replaceStore.loadRules(true)
      if (!response.isSuccess) {
        handleApiError(response, '加载规则失败')
      }
    } catch (cause) {
      handlePromiseError(cause, '加载规则失败')
    }
  }

  async function toggleEnabled(rule: ReplaceRule, enabled: boolean) {
    try {
      const response = await replaceStore.setRuleEnabled(rule, enabled)
      if (!response.isSuccess) {
        handleApiError(response, '更新失败')
      }
    } catch (cause) {
      handlePromiseError(cause, '更新失败')
    }
  }

  function openImport() {
    showImport.value = true
  }

  function openEdit(rule?: ReplaceRule) {
    currentEditRule.value = rule || null
    showEdit.value = true
  }

  async function deleteRule(rule: ReplaceRule) {
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定删除「${rule.name}」？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const ruleKey = getReplaceRuleKey(rule)
      const result = await replaceStore.deleteRulesByKeys([ruleKey])
      if (result.status === 'deleted') {
        options.setSelection(
          Array.from(options.selectedRuleKeys.value).filter(
            selectedRuleKey => selectedRuleKey !== ruleKey
          )
        )
        success('删除成功')
        return
      }

      error(result.errorMsg || '删除失败')
    } catch (cause) {
      handlePromiseError(cause, '删除失败')
    }
  }

  async function batchDelete() {
    if (options.selectedRuleKeys.value.size === 0) {
      return
    }

    const targetKeys = Array.from(options.selectedRuleKeys.value)
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定删除选中的 ${targetKeys.length} 条规则吗？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await replaceStore.deleteRulesByKeys(targetKeys)
      if (result.status === 'deleted') {
        options.toggleManageMode(false)
        success(`删除了 ${result.deletedCount} 条规则`)
        return
      }

      if (result.status === 'partial') {
        if (result.remainingKeys.length > 0) {
          options.setSelection(result.remainingKeys)
        } else {
          options.toggleManageMode(false)
        }

        success(`删除成功 ${result.deletedCount} 条，失败 ${result.failedCount} 条`)
        return
      }

      error(result.errorMsg || '批量删除失败')
    } catch (cause) {
      handlePromiseError(cause, '批量删除失败')
    }
  }

  function exportRules() {
    const target = replaceStore.getExportRules(
      options.selectedRuleKeys.value,
      options.filteredRules.value
    )

    try {
      downloadJsonFile(`replacerules_${Date.now()}.json`, target)
      success(`已导出 ${target.length} 条规则`)
    } catch (cause) {
      handlePromiseError(cause, '导出失败')
    }
  }

  function goBack() {
    void router.push('/')
  }

  onMounted(() => {
    void loadRules()
  })

  return {
    showImport,
    showEdit,
    currentEditRule,
    loadRules,
    toggleEnabled,
    openImport,
    openEdit,
    deleteRule,
    batchDelete,
    exportRules,
    goBack,
  }
}
