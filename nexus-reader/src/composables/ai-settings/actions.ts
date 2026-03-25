import type { Router } from 'vue-router'

interface AiSettingsStore {
  retryLastAction(): Promise<boolean>
  downloadModel(modelId: string): Promise<boolean>
  clearRuntimeCache(): Promise<void>
  unloadCurrentModel(): Promise<void>
  hydrateRuntime(): Promise<void>
}

interface ConfirmFn {
  (options: {
    title: string
    description: string
    variant?: 'destructive'
  }): Promise<boolean>
}

interface CreateAiSettingsActionsOptions {
  router: Router
  aiStore: AiSettingsStore
  confirm: ConfirmFn
  success: (message: string) => void
  handlePromiseError: (error: unknown, fallbackMessage?: string) => void
}

export function createAiSettingsActions(options: CreateAiSettingsActionsOptions) {
  const {
    router,
    aiStore,
    confirm,
    success,
    handlePromiseError,
  } = options

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

  async function hydrateRuntime() {
    await aiStore.hydrateRuntime()
  }

  return {
    clearCache,
    goBack,
    handleDownloadModel,
    handleUnloadModel,
    hydrateRuntime,
    retryLoading,
  }
}
