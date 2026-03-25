import { downloadJsonFile } from '@/utils/download'
import type { SourceListItem } from '@/stores/source'
import type { SourceManagementContext } from './types'

export function createSourceManagementActions(
  context: SourceManagementContext,
) {
  async function deleteSource(source: SourceListItem) {
    const confirmed = await context.confirm({
      title: '确认删除',
      description: `确定删除「${source.name}」？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await context.sourceStore.deleteSourceIds([source.id])
      if (result.status === 'deleted') {
        context.options.setSelection(
          Array.from(context.options.selectedSourceIds.value).filter(
            selectedId => selectedId !== source.id,
          ),
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
    if (context.options.selectedSourceIds.value.size === 0) {
      return
    }

    const targetIds = Array.from(context.options.selectedSourceIds.value)
    const confirmed = await context.confirm({
      title: '确认删除',
      description: `确定删除选中的 ${targetIds.length} 个书源吗？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await context.sourceStore.deleteSourceIds(targetIds)
      if (result.status === 'deleted') {
        context.options.toggleManageMode(false)
        context.success(`删除了 ${result.deletedCount} 个书源`)
        return
      }

      if (result.status === 'partial') {
        if (result.remainingIds.length > 0) {
          context.options.setSelection(result.remainingIds)
        } else {
          context.options.toggleManageMode(false)
        }

        context.warning(`已删除 ${result.deletedCount} 个书源，${result.failedCount} 个删除失败`)
        return
      }

      context.error(result.errorMsg || '批量删除失败')
    } catch (cause) {
      context.handlePromiseError(cause, '批量删除失败')
    }
  }

  function exportSources() {
    const target = context.sourceStore.getExportSources(
      context.options.selectedSourceIds.value,
      context.options.filteredSources.value,
    )

    downloadJsonFile(`booksources_${Date.now()}.json`, target)
    context.success(`已导出 ${target.length} 个书源`)
  }

  function deleteGroupSources(groupName: string) {
    context.warning(`当前版本暂不支持删除整组书源（分组：${groupName}）`)
  }

  return {
    deleteSource,
    batchDelete,
    exportSources,
    deleteGroupSources,
  }
}
