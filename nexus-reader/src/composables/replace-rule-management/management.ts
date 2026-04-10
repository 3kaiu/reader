import { downloadJsonFile } from '@/utils/download'
import { getReplaceRuleKey } from '@/utils/replaceRules'
import type { ReplaceRule } from '@/types/replace'
import type { ReplaceRuleManagementContext } from './types'

export function createReplaceRuleManagementActions(context: ReplaceRuleManagementContext) {
  async function deleteRule(rule: ReplaceRule) {
    const confirmed = await context.confirm({
      title: '确认删除',
      description: `确定删除「${rule.name}」？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const ruleKey = getReplaceRuleKey(rule)
      const result = await context.replaceStore.deleteRulesByKeys([ruleKey])
      if (result.status === 'deleted') {
        context.options.setSelection(
          Array.from(context.options.selectedRuleKeys.value).filter(
            selectedRuleKey => selectedRuleKey !== ruleKey
          )
        )
        context.success('删除成功')
        return
      }

      context.error(result.errorMsg || '删除失败')
    } catch (cause) {
      context.handlePromiseError(cause, '删除失败')
    }
  }

  async function batchDelete() {
    if (context.options.selectedRuleKeys.value.size === 0) {
      return
    }

    const targetKeys = Array.from(context.options.selectedRuleKeys.value)
    const confirmed = await context.confirm({
      title: '确认删除',
      description: `确定删除选中的 ${targetKeys.length} 条规则吗？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await context.replaceStore.deleteRulesByKeys(targetKeys)
      if (result.status === 'deleted') {
        context.options.toggleManageMode(false)
        context.success(`删除了 ${result.deletedCount} 条规则`)
        return
      }

      if (result.status === 'partial') {
        if (result.remainingKeys.length > 0) {
          context.options.setSelection(result.remainingKeys)
        } else {
          context.options.toggleManageMode(false)
        }

        context.success(`删除成功 ${result.deletedCount} 条，失败 ${result.failedCount} 条`)
        return
      }

      context.error(result.errorMsg || '批量删除失败')
    } catch (cause) {
      context.handlePromiseError(cause, '批量删除失败')
    }
  }

  function exportRules() {
    const target = context.replaceStore.getExportRules(
      context.options.selectedRuleKeys.value,
      context.options.filteredRules.value
    )

    try {
      downloadJsonFile(`replacerules_${Date.now()}.json`, target)
      context.success(`已导出 ${target.length} 条规则`)
    } catch (cause) {
      context.handlePromiseError(cause, '导出失败')
    }
  }

  return {
    deleteRule,
    batchDelete,
    exportRules,
  }
}
