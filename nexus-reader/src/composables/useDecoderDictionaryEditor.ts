import { ref } from 'vue'
import { useDecoderDictionaryStore } from '@/stores/decoderDictionary'
import type { DictionaryEntry } from '@/types/decoder'

export function useDecoderDictionaryEditor(options: {
  decoderDictionaryStore: ReturnType<typeof useDecoderDictionaryStore>
  success: (message: string) => void
  showError: (message: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
}) {
  const showEdit = ref(false)
  const currentEditEntry = ref<Partial<DictionaryEntry> | null>(null)
  const editForm = ref(options.decoderDictionaryStore.createEntryDraft())

  function resetEditState() {
    showEdit.value = false
    currentEditEntry.value = null
    editForm.value = options.decoderDictionaryStore.createEntryDraft()
  }

  function openEdit(entry?: DictionaryEntry) {
    currentEditEntry.value = entry || null
    editForm.value = options.decoderDictionaryStore.createEntryDraft(entry)
    showEdit.value = true
  }

  function closeEdit() {
    resetEditState()
  }

  async function saveEntry() {
    try {
      const result = await options.decoderDictionaryStore.saveEntryDraft(
        editForm.value,
        currentEditEntry.value
      )

      if (result.status === 'invalid') {
        options.showError(result.errorMsg || '请填写加密词和真实指代')
        return
      }

      if (result.status === 'failed') {
        options.showError(result.errorMsg || '保存失败')
        return
      }

      options.success(currentEditEntry.value ? '保存成功' : '已保存到公共词典')
      resetEditState()
    } catch (error) {
      options.handlePromiseError(error, '保存失败')
    }
  }

  return {
    showEdit,
    currentEditEntry,
    editForm,
    openEdit,
    closeEdit,
    saveEntry,
  }
}
