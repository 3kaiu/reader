import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { createReplaceRuleDialogActions } from '@/composables/replace-rule-management/dialogs'
import { createReplaceRuleLoadingActions } from '@/composables/replace-rule-management/loading'
import { createReplaceRuleManagementActions } from '@/composables/replace-rule-management/management'
import { createReplaceRuleNavigationActions } from '@/composables/replace-rule-management/navigation'
import { createReplaceRuleManagementState } from '@/composables/replace-rule-management/state'
import type {
  ReplaceRuleManagementContext,
  ReplaceRuleManagementSelection,
} from '@/composables/replace-rule-management/types'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useReplaceStore } from '@/stores/replace'

export function useReplaceRuleManagementView(options: ReplaceRuleManagementSelection) {
  const router = useRouter()
  const { success, error } = useMessage()
  const { confirm } = useConfirm()
  const { handleApiError, handlePromiseError } = useErrorHandler()
  const replaceStore = useReplaceStore()
  const state = createReplaceRuleManagementState()
  const context: ReplaceRuleManagementContext = {
    options,
    state,
    router,
    replaceStore,
    confirm,
    success,
    error,
    handleApiError,
    handlePromiseError,
  }
  const dialogActions = createReplaceRuleDialogActions(state)
  const loadingActions = createReplaceRuleLoadingActions(context)
  const managementActions = createReplaceRuleManagementActions(context)
  const navigationActions = createReplaceRuleNavigationActions(context)

  onMounted(() => {
    void loadingActions.loadRules()
  })

  return {
    ...state,
    ...loadingActions,
    ...dialogActions,
    ...managementActions,
    ...navigationActions,
  }
}
