import { ref } from 'vue'
import { useAiAnalysisStore } from '@/stores/aiAnalysis'
import type { AiMappingRule } from '@/types/ai-analysis'

export function useAiAnalysisMappingEditor(options: {
  aiAnalysisStore: ReturnType<typeof useAiAnalysisStore>
  success: (message: string) => void
  error: (message: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
}) {
  const showAddDialog = ref(false)
  const editingRule = ref<AiMappingRule | null>(null)
  const newRule = ref(options.aiAnalysisStore.createMappingDraft())

  function openAddDialog(rule?: AiMappingRule) {
    editingRule.value = rule || null
    newRule.value = options.aiAnalysisStore.createMappingDraft(rule)
    showAddDialog.value = true
  }

  function closeAddDialog() {
    showAddDialog.value = false
    editingRule.value = null
    newRule.value = options.aiAnalysisStore.createMappingDraft()
  }

  async function saveMapping() {
    try {
      const result = await options.aiAnalysisStore.saveMappingDraft(
        newRule.value,
        editingRule.value
      )

      if (result.status === 'saved') {
        options.success(editingRule.value ? '映射规则已更新' : '映射规则已添加')
        closeAddDialog()
        return
      }

      if (result.status === 'invalid') {
        options.error(result.errorMsg || '请填写完整信息')
        return
      }

      options.error(`保存失败: ${result.errorMsg || '未知错误'}`)
    } catch (cause) {
      options.handlePromiseError(cause, '保存失败')
    }
  }

  return {
    showAddDialog,
    editingRule,
    newRule,
    openAddDialog,
    closeAddDialog,
    saveMapping,
  }
}
