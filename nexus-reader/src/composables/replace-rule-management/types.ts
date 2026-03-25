import type { Ref } from 'vue'
import type { Router } from 'vue-router'
import { useReplaceStore } from '@/stores/replace'
import type { ReplaceRule } from '@/types/replace'

export interface ReplaceRuleManagementSelection {
  selectedRuleKeys: Ref<Set<string>>
  filteredRules: Ref<ReplaceRule[]>
  clearSelection: () => void
  setSelection: (keys: Iterable<string>) => void
  toggleManageMode: (force?: boolean) => void
}

export interface ReplaceRuleManagementState {
  showImport: Ref<boolean>
  showEdit: Ref<boolean>
  currentEditRule: Ref<ReplaceRule | null>
}

export interface ReplaceRuleManagementContext {
  options: ReplaceRuleManagementSelection
  state: ReplaceRuleManagementState
  router: Router
  replaceStore: ReturnType<typeof useReplaceStore>
  confirm: (options: {
    title: string
    description?: string
    variant?: 'default' | 'destructive'
  }) => Promise<boolean>
  success: (message: string) => void
  error: (message: string) => void
  handleApiError: (
    response: { isSuccess?: boolean; errorMsg?: string },
    fallbackMessage?: string,
    showToast?: boolean,
  ) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
}
