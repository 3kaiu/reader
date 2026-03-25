import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useAiStore } from '@/stores/ai/store'
import { createAiSettingsActions } from './ai-settings/actions'
import { getModelSeriesIcon } from './ai-settings/icons'

export function useAiSettingsView() {
  const router = useRouter()
  const aiStore = useAiStore()
  const { success } = useMessage()
  const { confirm } = useConfirm()
  const { handlePromiseError } = useErrorHandler()
  const actions = createAiSettingsActions({
    router,
    aiStore,
    confirm,
    success,
    handlePromiseError,
  })

  onMounted(() => {
    void actions.hydrateRuntime()
  })

  return {
    aiStore,
    getModelSeriesIcon,
    ...actions,
  }
}
