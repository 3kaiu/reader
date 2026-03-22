import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Brain,
  Sparkles,
  Infinity as InfinityIcon,
} from 'lucide-vue-next'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useAiStore } from '@/stores/ai/store'
import { getAiModelSeries } from '@/utils/aiModel'

const MODEL_SERIES_ICONS = {
  qwen: Sparkles,
  llama: InfinityIcon,
  default: Brain,
} as const

export function useAiSettingsView() {
  const router = useRouter()
  const aiStore = useAiStore()
  const { success } = useMessage()
  const { confirm } = useConfirm()
  const { handlePromiseError } = useErrorHandler()

  function getModelSeriesIcon(modelId: string) {
    return MODEL_SERIES_ICONS[getAiModelSeries(modelId)]
  }

  async function retryLoading() {
    await aiStore.retryLastAction()
  }

  async function handleDownloadModel(modelId: string) {
    try {
      const loaded = await aiStore.downloadModel(modelId)
      if (!loaded) {
        return
      }

      success(`模型 ${modelId} 已就绪`)
    } catch (error) {
      handlePromiseError(error, '模型加载失败')
    }
  }

  async function clearCache() {
    const confirmed = await confirm({
      title: '确认清理缓存',
      description:
        '确定要清理浏览器中的 AI 运行时缓存吗？下次使用相关模型时会重新加载。',
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      await aiStore.clearRuntimeCache()
      success('本地 AI 运行时缓存已清理')
    } catch (error) {
      handlePromiseError(error, '清理失败')
    }
  }

  async function handleUnloadModel() {
    try {
      await aiStore.unloadCurrentModel()
      success('当前模型已卸载')
    } catch (error) {
      handlePromiseError(error, '卸载失败')
    }
  }

  function goBack() {
    router.back()
  }

  onMounted(() => {
    void aiStore.hydrateRuntime()
  })

  return {
    aiStore,
    getModelSeriesIcon,
    goBack,
    retryLoading,
    handleDownloadModel,
    clearCache,
    handleUnloadModel,
  }
}
