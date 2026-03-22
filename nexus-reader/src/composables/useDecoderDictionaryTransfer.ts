import type { Ref } from 'vue'
import { useTextFileInput } from '@/composables/useTextFileInput'
import { useDecoderDictionaryStore } from '@/stores/decoderDictionary'
import type { DictionaryEntry } from '@/types/decoder'
import { pickDecoderEntriesByIds } from '@/utils/decoderDictionaryView'
import { downloadJsonFile } from '@/utils/download'

export function useDecoderDictionaryTransfer(options: {
  entries: Ref<DictionaryEntry[]>
  selectedEntryIds: Ref<Set<string>>
  decoderDictionaryStore: ReturnType<typeof useDecoderDictionaryStore>
  success: (message: string) => void
  showError: (message: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
}) {
  const {
    inputRef: importInputRef,
    handleFileChange: handleImportEntries,
    triggerFileSelect: triggerImport,
  } = useTextFileInput({
    onText: async text => {
      const result = await options.decoderDictionaryStore.importEntriesFromText(text)
      if (result.status === 'failed') {
        options.showError(result.errorMsg || '导入失败')
        return
      }

      if (result.skippedCount > 0) {
        options.success(
          `成功导入 ${result.imported} 条词条，跳过 ${result.skippedCount} 条无效或失败数据`
        )
        return
      }

      options.success(`成功导入 ${result.imported} 条词条`)
    },
    onError: error => {
      options.handlePromiseError(error, '导入失败')
    },
  })

  async function exportEntries() {
    try {
      const targetEntries =
        options.selectedEntryIds.value.size > 0
          ? pickDecoderEntriesByIds(
              options.entries.value,
              options.selectedEntryIds.value
            )
          : undefined
      const transferEntries =
        await options.decoderDictionaryStore.exportEntries(targetEntries)

      downloadJsonFile(`decoder-dictionary_${Date.now()}.json`, transferEntries)
      options.success(`已导出 ${transferEntries.length} 条词条`)
    } catch (error) {
      options.handlePromiseError(error, '导出失败')
    }
  }

  return {
    importInputRef,
    handleImportEntries,
    triggerImport,
    exportEntries,
  }
}
