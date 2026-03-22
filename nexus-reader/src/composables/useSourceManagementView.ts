import { onMounted, ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useSourceStore, type SourceListItem } from '@/stores/source'
import { downloadJsonFile } from '@/utils/download'

type SourceManagementSelection = {
  selectedSourceIds: Ref<Set<string>>
  filteredSources: Ref<SourceListItem[]>
  clearSelection: () => void
  setSelection: (ids: Iterable<string>) => void
  toggleManageMode: (force?: boolean) => void
}

export function useSourceManagementView(options: SourceManagementSelection) {
  const router = useRouter()
  const { success, error, warning } = useMessage()
  const { confirm } = useConfirm()
  const { handlePromiseError } = useErrorHandler()
  const sourceStore = useSourceStore()

  const showImport = ref(false)
  const showEdit = ref(false)
  const currentEditSource = ref<SourceListItem | null>(null)

  async function loadSources() {
    options.clearSelection()

    try {
      const response = await sourceStore.loadSources(true)
      if (!response.isSuccess) {
        error(response.errorMsg || '加载书源失败')
      }
    } catch {
      error('加载书源失败')
    }
  }

  async function toggleEnable(source: SourceListItem, enabled: boolean) {
    try {
      const response = await sourceStore.setSourceEnabled(source.id, enabled)
      if (response.isSuccess) {
        success(enabled ? '已启用书源' : '已禁用书源')
        return
      }

      error(response.errorMsg || '更新书源状态失败')
    } catch (cause) {
      handlePromiseError(cause, '更新书源状态失败')
    }
  }

  function openImport() {
    showImport.value = true
  }

  function openEdit(source: SourceListItem) {
    currentEditSource.value = source
    showEdit.value = true
  }

  async function deleteSource(source: SourceListItem) {
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定删除「${source.name}」？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await sourceStore.deleteSourceIds([source.id])
      if (result.status === 'deleted') {
        options.setSelection(
          Array.from(options.selectedSourceIds.value).filter(
            selectedId => selectedId !== source.id
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
    if (options.selectedSourceIds.value.size === 0) {
      return
    }

    const targetIds = Array.from(options.selectedSourceIds.value)
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定删除选中的 ${targetIds.length} 个书源吗？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await sourceStore.deleteSourceIds(targetIds)
      if (result.status === 'deleted') {
        options.toggleManageMode(false)
        success(`删除了 ${result.deletedCount} 个书源`)
        return
      }

      if (result.status === 'partial') {
        if (result.remainingIds.length > 0) {
          options.setSelection(result.remainingIds)
        } else {
          options.toggleManageMode(false)
        }

        warning(`已删除 ${result.deletedCount} 个书源，${result.failedCount} 个删除失败`)
        return
      }

      error(result.errorMsg || '批量删除失败')
    } catch (cause) {
      handlePromiseError(cause, '批量删除失败')
    }
  }

  function exportSources() {
    const target = sourceStore.getExportSources(
      options.selectedSourceIds.value,
      options.filteredSources.value
    )

    downloadJsonFile(`booksources_${Date.now()}.json`, target)
    success(`已导出 ${target.length} 个书源`)
  }

  function deleteGroupSources(groupName: string) {
    warning(`当前版本暂不支持删除整组书源（分组：${groupName}）`)
  }

  function goBack() {
    void router.push('/')
  }

  onMounted(() => {
    void loadSources()
  })

  return {
    showImport,
    showEdit,
    currentEditSource,
    loadSources,
    toggleEnable,
    openImport,
    openEdit,
    deleteSource,
    batchDelete,
    exportSources,
    deleteGroupSources,
    goBack,
  }
}
