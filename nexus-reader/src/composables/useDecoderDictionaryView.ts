import { onMounted, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useDecoderDictionaryDeletion } from '@/composables/useDecoderDictionaryDeletion'
import { useDecoderDictionaryEditor } from '@/composables/useDecoderDictionaryEditor'
import { useDecoderDictionaryTransfer } from '@/composables/useDecoderDictionaryTransfer'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useDecoderDictionaryStore } from '@/stores/decoderDictionary'

type DecoderDictionarySelection = {
  selectedEntryIds: Ref<Set<string>>
  clearSelection: () => void
  setSelection: (ids: Iterable<string>) => void
  toggleManageMode: (force?: boolean) => void
}

export function useDecoderDictionaryView(options: DecoderDictionarySelection) {
  const router = useRouter()
  const { success, error: showError } = useMessage()
  const { confirm } = useConfirm()
  const { handlePromiseError } = useErrorHandler()
  const decoderDictionaryStore = useDecoderDictionaryStore()
  const { entries, loading, categoryStats } = storeToRefs(decoderDictionaryStore)
  const {
    showEdit,
    currentEditEntry,
    editForm,
    openEdit,
    closeEdit,
    saveEntry,
  } = useDecoderDictionaryEditor({
    decoderDictionaryStore,
    success,
    showError,
    handlePromiseError,
  })
  const {
    importInputRef,
    handleImportEntries,
    triggerImport,
    exportEntries,
  } = useDecoderDictionaryTransfer({
    entries,
    selectedEntryIds: options.selectedEntryIds,
    decoderDictionaryStore,
    success,
    showError,
    handlePromiseError,
  })
  const { deleteEntry, batchDelete } = useDecoderDictionaryDeletion({
    entries,
    selectedEntryIds: options.selectedEntryIds,
    setSelection: options.setSelection,
    toggleManageMode: options.toggleManageMode,
    confirm,
    decoderDictionaryStore,
    success,
    showError,
    handlePromiseError,
  })

  async function loadEntries(force = false) {
    options.clearSelection()
    try {
      await decoderDictionaryStore.loadEntries(force)
    } catch (error) {
      handlePromiseError(error, '加载词典失败')
    }
  }

  function goBack() {
    void router.push('/')
  }

  onMounted(() => {
    void loadEntries()
  })

  return {
    entries,
    loading,
    categoryStats,
    showEdit,
    currentEditEntry,
    editForm,
    importInputRef,
    handleImportEntries,
    triggerImport,
    loadEntries,
    openEdit,
    closeEdit,
    saveEntry,
    deleteEntry,
    batchDelete,
    exportEntries,
    goBack,
  }
}
