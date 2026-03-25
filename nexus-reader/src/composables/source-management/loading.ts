import type { SourceListItem } from '@/stores/source'
import type { SourceManagementContext } from './types'

export function createSourceLoadingActions(
  context: SourceManagementContext,
) {
  async function loadSources() {
    context.options.clearSelection()

    try {
      const response = await context.sourceStore.loadSources(true)
      if (!response.isSuccess) {
        context.error(response.errorMsg || '加载书源失败')
      }
    } catch {
      context.error('加载书源失败')
    }
  }

  async function toggleEnable(source: SourceListItem, enabled: boolean) {
    try {
      const response = await context.sourceStore.setSourceEnabled(source.id, enabled)
      if (response.isSuccess) {
        context.success(enabled ? '已启用书源' : '已禁用书源')
        return
      }

      context.error(response.errorMsg || '更新书源状态失败')
    } catch (cause) {
      context.handlePromiseError(cause, '更新书源状态失败')
    }
  }

  return {
    loadSources,
    toggleEnable,
  }
}
