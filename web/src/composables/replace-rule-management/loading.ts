import type { ReplaceRule } from '@/types/replace'
import type { ReplaceRuleManagementContext } from './types'

export function createReplaceRuleLoadingActions(context: ReplaceRuleManagementContext) {
  async function loadRules() {
    context.options.clearSelection()

    try {
      const response = await context.replaceStore.loadRules(true)
      if (!response.isSuccess) {
        context.handleApiError(response, '加载规则失败')
      }
    } catch (cause) {
      context.handlePromiseError(cause, '加载规则失败')
    }
  }

  async function toggleEnabled(rule: ReplaceRule, enabled: boolean) {
    try {
      const response = await context.replaceStore.setRuleEnabled(rule, enabled)
      if (!response.isSuccess) {
        context.handleApiError(response, '更新失败')
      }
    } catch (cause) {
      context.handlePromiseError(cause, '更新失败')
    }
  }

  return {
    loadRules,
    toggleEnabled,
  }
}
