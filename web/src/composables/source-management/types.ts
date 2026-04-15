import type { Ref } from 'vue'
import type { Router } from 'vue-router'
import { useSourceStore, type SourceListItem } from '@/stores/source'

export interface SourceManagementSelection {
  selectedSourceIds: Ref<Set<string>>
  filteredSources: Ref<SourceListItem[]>
  clearSelection: () => void
  setSelection: (ids: Iterable<string>) => void
  toggleManageMode: (force?: boolean) => void
}

export interface SourceManagementState {
  showImport: Ref<boolean>
  showEdit: Ref<boolean>
  currentEditSource: Ref<SourceListItem | null>
}

export interface SourceManagementContext {
  options: SourceManagementSelection
  state: SourceManagementState
  router: Router
  sourceStore: ReturnType<typeof useSourceStore>
  confirm: (options: {
    title: string
    description?: string
    variant?: 'default' | 'destructive'
  }) => Promise<boolean>
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
  handlePromiseError: (cause: unknown, fallbackMessage?: string) => void
}
