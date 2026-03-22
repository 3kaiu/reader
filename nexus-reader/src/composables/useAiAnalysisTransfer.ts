import { useTextFileInput } from '@/composables/useTextFileInput'
import { useAiAnalysisStore } from '@/stores/aiAnalysis'
import { downloadJsonFile } from '@/utils/download'

export function useAiAnalysisTransfer(options: {
  aiAnalysisStore: ReturnType<typeof useAiAnalysisStore>
  success: (message: string) => void
  error: (message: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
}) {
  const {
    inputRef: importInputRef,
    handleFileChange: importMappings,
    triggerFileSelect: triggerImport,
  } = useTextFileInput({
    onText: async text => {
      const result = await options.aiAnalysisStore.importMappingsFromText(text)

      if (result.status === 'failed') {
        options.error(result.errorMsg || '导入失败')
        return
      }

      options.success(
        result.skippedCount > 0
          ? `映射规则导入成功，导入 ${result.importedCount} 条，跳过 ${result.skippedCount} 条无效或失败数据`
          : `映射规则导入成功，共 ${result.importedCount} 条`
      )
    },
    onError: cause => {
      options.handlePromiseError(cause, '导入失败')
    },
  })

  function exportMappings() {
    try {
      const data = options.aiAnalysisStore.exportMappings()
      downloadJsonFile(`ai-analysis-mappings_${Date.now()}.json`, data)
      options.success('映射规则导出成功')
    } catch (cause) {
      options.handlePromiseError(cause, '导出失败')
    }
  }

  return {
    importInputRef,
    importMappings,
    triggerImport,
    exportMappings,
  }
}
