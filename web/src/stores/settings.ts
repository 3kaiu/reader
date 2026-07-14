import { defineStore } from 'pinia'
import { createSettingsStoreActions } from './settings-store/actions'
import { createSettingsStoreState } from './settings-store/state'
import { createSettingsStoreView } from './settings-store/view'

export type {
  ChineseConvert,
  FontFamily,
  ReaderConfig,
  ReaderPerformanceMode,
  ReaderTheme,
  ThemeColors,
} from '@/types/settings'

export const useSettingsStore = defineStore('settings', () => {
  const state = createSettingsStoreState()
  const view = createSettingsStoreView(state)
  const actions = createSettingsStoreActions(state, view)

  function $reset() {
    const initial = createSettingsStoreState()
    for (const key of Object.keys(state) as (keyof typeof state)[]) {
      const ref = state[key]
      const initialRef = initial[key]
      if ('value' in ref && 'value' in initialRef) {
        ;(ref as { value: unknown }).value = (initialRef as { value: unknown }).value
      } else if (ref && typeof ref === 'object' && !('value' in ref)) {
        // Handle reactive objects
        Object.assign(ref, initialRef)
      }
    }
  }

  return {
    ...state,
    ...view,
    ...actions,
    $reset,
  }
})
