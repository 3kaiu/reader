import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { createSourceDialogActions } from '@/composables/source-management/dialogs'
import { createSourceLoadingActions } from '@/composables/source-management/loading'
import { createSourceManagementActions } from '@/composables/source-management/management'
import { createSourceNavigationActions } from '@/composables/source-management/navigation'
import { createSourceManagementState } from '@/composables/source-management/state'
import type {
  SourceManagementContext,
  SourceManagementSelection,
} from '@/composables/source-management/types'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useSourceStore } from '@/stores/source'

export function useSourceManagementView(options: SourceManagementSelection) {
  const router = useRouter()
  const { success, error, warning } = useMessage()
  const { confirm } = useConfirm()
  const { handlePromiseError } = useErrorHandler()
  const sourceStore = useSourceStore()
  const state = createSourceManagementState()
  const context: SourceManagementContext = {
    options,
    state,
    router,
    sourceStore,
    confirm,
    success,
    error,
    warning,
    handlePromiseError,
  }
  const dialogActions = createSourceDialogActions(state)
  const loadingActions = createSourceLoadingActions(context)
  const managementActions = createSourceManagementActions(context)
  const navigationActions = createSourceNavigationActions(context)

  onMounted(() => {
    void loadingActions.loadSources()
  })

  return {
    ...state,
    ...loadingActions,
    ...dialogActions,
    ...managementActions,
    ...navigationActions,
  }
}
