import { ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { useTextFileInput } from '@/composables/useTextFileInput'
import { useReplaceStore } from '@/stores/replace'

export function useImportRuleView(options: {
  close: () => void
  notifySuccess: () => void
}) {
  const message = useMessage()
  const replaceStore = useReplaceStore()

  const loading = ref(false)
  const jsonText = ref('')

  const { handleFileChange: onFileChange } = useTextFileInput({
    onText: text => {
      jsonText.value = text
    },
    onError: error => {
      message.error((error as Error)?.message || '读取文件失败')
    },
  })

  async function handleImport() {
    if (!jsonText.value.trim()) {
      message.warning('请输入内容')
      return
    }

    loading.value = true
    try {
      const result = await replaceStore.importRulesFromText(jsonText.value)
      if (result.normalizedText) {
        jsonText.value = result.normalizedText
      }

      if (result.status === 'failed') {
        message.warning(result.errorMsg || '导入失败')
        return
      }

      if (result.skippedCount > 0) {
        message.warning(`已跳过 ${result.skippedCount} 条不合法规则`)
      }

      if (result.status === 'partial') {
        message.warning(
          `已导入 ${result.savedCount} 条规则，${result.rules.length - result.savedCount} 条失败`
        )
        options.notifySuccess()
        return
      }

      message.success(`成功导入 ${result.savedCount} 条规则`)
      options.notifySuccess()
      options.close()
      jsonText.value = ''
    } catch {
      message.error('导入出错')
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    jsonText,
    onFileChange,
    handleImport,
  }
}
