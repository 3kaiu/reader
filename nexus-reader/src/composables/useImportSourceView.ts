import { onBeforeUnmount, ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { useTextFileInput } from '@/composables/useTextFileInput'
import { useSourceStore } from '@/stores/source'
import { parseSourceImportText } from '@/utils/sourceImport'

type SourceImportPreview = {
  success: boolean
  count: number
  format: string
  error?: string
  sources?: Record<string, unknown>[]
}

export function useImportSourceView(options: {
  close: () => void
  notifySuccess: () => void
}) {
  const message = useMessage()
  const sourceStore = useSourceStore()

  const loading = ref(false)
  const jsonText = ref('')
  const parseResult = ref<SourceImportPreview | null>(null)
  const isDragging = ref(false)
  let previewTimer: ReturnType<typeof setTimeout> | null = null

  const {
    loadFile,
    handleFileChange: onFileChange,
  } = useTextFileInput({
    onText: text => {
      jsonText.value = text
      previewParse()
    },
    onError: error => {
      message.error((error as Error)?.message || '读取文件失败')
    },
  })

  function previewParse() {
    if (!jsonText.value.trim()) {
      parseResult.value = null
      return
    }

    const result = parseSourceImportText(jsonText.value)
    parseResult.value = {
      success: result.success,
      count: result.sources.length,
      format: result.format,
      error: result.error,
      sources: result.sources,
    }
  }

  async function handleImport() {
    loading.value = true
    try {
      if (!jsonText.value.trim()) {
        message.warning('请输入书源内容')
        return
      }

      const result = await sourceStore.importSourceText(jsonText.value)
      if (result.normalizedText) {
        jsonText.value = result.normalizedText
        previewParse()
      }

      if (result.status === 'failed') {
        message.error(result.errorMsg || '导入失败')
        return
      }

      if (result.status === 'partial') {
        options.notifySuccess()
        message.warning(
          `已导入 ${result.successCount} 个书源，${result.totalCount - result.successCount} 个失败`
        )
        return
      }

      message.success(`成功导入 ${result.successCount} 个书源`)
      options.notifySuccess()
      options.close()
      jsonText.value = ''
      parseResult.value = null
    } catch (error: unknown) {
      message.error('导入出错: ' + ((error as Error)?.message || '未知错误'))
    } finally {
      loading.value = false
    }
  }

  function onDrop(event: DragEvent) {
    isDragging.value = false
    const file = event.dataTransfer?.files?.[0]
    if (file) {
      void loadFile(file)
    }
  }

  function onInputChange() {
    if (previewTimer) {
      clearTimeout(previewTimer)
    }

    previewTimer = setTimeout(() => {
      previewParse()
      previewTimer = null
    }, 300)
  }

  onBeforeUnmount(() => {
    if (previewTimer) {
      clearTimeout(previewTimer)
    }
  })

  return {
    loading,
    jsonText,
    parseResult,
    isDragging,
    onFileChange,
    handleImport,
    onDrop,
    onInputChange,
  }
}
