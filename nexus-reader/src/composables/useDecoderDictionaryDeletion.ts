import type { Ref } from 'vue'
import { useDecoderDictionaryStore } from '@/stores/decoderDictionary'
import type { DictionaryEntry } from '@/types/decoder'
import { getRemainingBatchIds } from '@/utils/batchMutation'
import { pickDecoderEntriesByIds } from '@/utils/decoderDictionaryView'

export function useDecoderDictionaryDeletion(options: {
  entries: Ref<DictionaryEntry[]>
  selectedEntryIds: Ref<Set<string>>
  setSelection: (ids: Iterable<string>) => void
  toggleManageMode: (force?: boolean) => void
  confirm: (options: {
    title: string
    description?: string
    variant?: 'default' | 'destructive'
  }) => Promise<boolean>
  decoderDictionaryStore: ReturnType<typeof useDecoderDictionaryStore>
  success: (message: string) => void
  showError: (message: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
}) {
  async function deleteEntry(entry: DictionaryEntry) {
    const confirmed = await options.confirm({
      title: '确认删除',
      description: `确定删除「${entry.original}」→「${entry.real}」？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const removed = await options.decoderDictionaryStore.removeEntry(entry)
      if (!removed) {
        options.showError('删除失败')
        return
      }

      options.setSelection(
        Array.from(options.selectedEntryIds.value).filter(
          selectedId => selectedId !== entry.id
        )
      )
      options.success('删除成功')
    } catch (error) {
      options.handlePromiseError(error, '删除词条失败')
    }
  }

  async function batchDelete() {
    if (options.selectedEntryIds.value.size === 0) {
      return
    }

    const confirmed = await options.confirm({
      title: '确认删除',
      description: `确定删除选中的 ${options.selectedEntryIds.value.size} 条词条吗？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      const targetEntries = pickDecoderEntriesByIds(
        options.entries.value,
        options.selectedEntryIds.value
      )
      const deleteResult = await options.decoderDictionaryStore.removeEntries(
        targetEntries
      )

      if (deleteResult.failed > 0) {
        const remainingIds = getRemainingBatchIds(
          Array.from(options.selectedEntryIds.value),
          deleteResult.deletedIds
        )
        if (remainingIds.length > 0) {
          options.setSelection(remainingIds)
        } else {
          options.toggleManageMode(false)
        }

        options.success(`删除成功 ${deleteResult.deleted} 条，失败 ${deleteResult.failed} 条`)
        return
      }

      options.toggleManageMode(false)
      options.success(`成功删除 ${deleteResult.deleted} 条词条`)
    } catch (error) {
      options.handlePromiseError(error, '批量删除失败')
    }
  }

  return {
    deleteEntry,
    batchDelete,
  }
}
