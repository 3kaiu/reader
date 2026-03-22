import { useRouter } from 'vue-router'
import { useConfirm } from '@/composables/useConfirm'
import { useAiAnalysisStore } from '@/stores/aiAnalysis'
import type { AiMappingRule } from '@/types/ai-analysis'

export function useAiAnalysisManagementActions(options: {
  aiAnalysisStore: ReturnType<typeof useAiAnalysisStore>
  success: (message: string) => void
  error: (message: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
}) {
  const router = useRouter()
  const { confirm } = useConfirm()

  function goBack() {
    void router.push('/settings')
  }

  async function deleteMapping(rule: AiMappingRule) {
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除映射规则 "${rule.original} → ${rule.target}" 吗？`,
    })
    if (!confirmed) {
      return
    }

    try {
      const response = await options.aiAnalysisStore.deleteMapping(rule.id)
      if (response.isSuccess) {
        options.success('映射规则已删除')
        return
      }

      options.error(response.errorMsg || '删除失败')
    } catch (cause) {
      options.handlePromiseError(cause, '删除失败')
    }
  }

  async function toggleMapping(rule: AiMappingRule, enabled: boolean) {
    try {
      const response = await options.aiAnalysisStore.setMappingEnabled(rule, enabled)
      if (!response.isSuccess) {
        options.error(response.errorMsg || '更新失败')
      }
    } catch (cause) {
      options.handlePromiseError(cause, '更新失败')
    }
  }

  async function clearHistory() {
    const confirmed = await confirm({
      title: '确认清除',
      description: '确定要清除所有分析历史记录吗？此操作不可恢复。',
    })
    if (!confirmed) {
      return
    }

    try {
      const response = await options.aiAnalysisStore.clearHistory()
      if (response.isSuccess) {
        options.success('历史记录已清除')
        return
      }

      options.error(response.errorMsg || '清除失败')
    } catch (cause) {
      options.handlePromiseError(cause, '清除失败')
    }
  }

  return {
    goBack,
    deleteMapping,
    toggleMapping,
    clearHistory,
  }
}
