import type { Ref } from 'vue'
import { downloadJsonFile } from '@/utils/download'

export interface DeleteResult<K> {
  status: string
  deletedCount?: number
  failedCount?: number
  remainingIds?: K[]
  errorMsg?: string
}

export type ConfirmFn = (options: {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}) => Promise<boolean>

export interface ManageModeDeleteDeps<T, K extends string> {
  name: (item: T) => string
  getKey: (item: T) => K
  selectedKeys: Ref<Set<K>>
  confirm: ConfirmFn
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
  deleteByIds: (ids: K[]) => Promise<DeleteResult<K>>
  setSelection: (keys: Iterable<K>) => void
  toggleManageMode: (force?: boolean) => void
}

export interface ManageModeExportDeps<T, K extends string> {
  selectedKeys: Ref<Set<K>>
  filteredItems: Ref<readonly T[]>
  getExportItems: (selected: Set<K>, filtered: T[]) => T[]
  buildExportFilename: () => string
  success: (message: string) => void
  error: (message: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
}

export function createManageModeDeleteActions<T, K extends string>(
  deps: ManageModeDeleteDeps<T, K>
) {
  async function deleteItem(item: T) {
    const itemName = deps.name(item)
    const confirmed = await deps.confirm({
      title: '确认删除',
      description: `确定删除「${itemName}」？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const key = deps.getKey(item)
      const result = await deps.deleteByIds([key])
      if (result.status === 'deleted') {
        deps.setSelection(
          Array.from(deps.selectedKeys.value).filter(selectedKey => selectedKey !== key)
        )
        deps.success('删除成功')
        return
      }

      deps.error(result.errorMsg || '删除失败')
    } catch (cause) {
      deps.handlePromiseError(cause, '删除失败')
    }
  }

  async function batchDelete() {
    if (deps.selectedKeys.value.size === 0) {
      return
    }

    const targetIds = Array.from(deps.selectedKeys.value)
    const confirmed = await deps.confirm({
      title: '确认删除',
      description: `确定删除选中的 ${targetIds.length} 个条目吗？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await deps.deleteByIds(targetIds)
      if (result.status === 'deleted') {
        deps.toggleManageMode(false)
        deps.success(`删除了 ${result.deletedCount} 个条目`)
        return
      }

      if (result.status === 'partial') {
        if (result.remainingIds && result.remainingIds.length > 0) {
          deps.setSelection(result.remainingIds)
        } else {
          deps.toggleManageMode(false)
        }

        deps.warning(`已删除 ${result.deletedCount} 个，${result.failedCount} 个删除失败`)
        return
      }

      deps.error(result.errorMsg || '批量删除失败')
    } catch (cause) {
      deps.handlePromiseError(cause, '批量删除失败')
    }
  }

  return {
    deleteItem,
    batchDelete,
  }
}

export function createManageModeExportActions<T, K extends string>(
  deps: ManageModeExportDeps<T, K>
) {
  function exportItems() {
    const target = deps.getExportItems(deps.selectedKeys.value, deps.filteredItems.value as T[])

    try {
      downloadJsonFile(deps.buildExportFilename(), target)
      deps.success(`已导出 ${target.length} 个条目`)
    } catch (cause) {
      deps.handlePromiseError(cause, '导出失败')
    }
  }

  return {
    exportItems,
  }
}
