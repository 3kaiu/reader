import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import { useAiAnalysisManagementActions } from '@/composables/useAiAnalysisManagementActions'
import { useAiAnalysisMappingEditor } from '@/composables/useAiAnalysisMappingEditor'
import { useAiAnalysisTransfer } from '@/composables/useAiAnalysisTransfer'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useAiAnalysisStore } from '@/stores/aiAnalysis'

export function useAiAnalysisSettingsView() {
  const { success, error } = useMessage()
  const { handlePromiseError } = useErrorHandler()
  const aiAnalysisStore = useAiAnalysisStore()
  const {
    history,
    searchKeyword,
    filterType,
    displayMappings,
    stats,
  } = storeToRefs(aiAnalysisStore)
  const {
    showAddDialog,
    editingRule,
    newRule,
    openAddDialog,
    closeAddDialog,
    saveMapping,
  } = useAiAnalysisMappingEditor({
    aiAnalysisStore,
    success,
    error,
    handlePromiseError,
  })
  const {
    importInputRef,
    importMappings,
    triggerImport,
    exportMappings,
  } = useAiAnalysisTransfer({
    aiAnalysisStore,
    success,
    error,
    handlePromiseError,
  })
  const {
    goBack,
    deleteMapping,
    toggleMapping,
    clearHistory,
  } = useAiAnalysisManagementActions({
    aiAnalysisStore,
    success,
    error,
    handlePromiseError,
  })

  onMounted(() => {
    aiAnalysisStore.hydrate().catch(cause => {
      handlePromiseError(cause, '加载数据失败')
    })
  })

  return {
    history,
    searchKeyword,
    filterType,
    displayMappings,
    stats,
    showAddDialog,
    editingRule,
    newRule,
    importInputRef,
    importMappings,
    triggerImport,
    goBack,
    openAddDialog,
    closeAddDialog,
    saveMapping,
    deleteMapping,
    toggleMapping,
    exportMappings,
    clearHistory,
  }
}
