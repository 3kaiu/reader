import type { SettingsStoreActions } from '../types'
import type { SettingsStoreActionContext } from './helpers'

type SettingsUiActions = Pick<
  SettingsStoreActions,
  'updateTheme' | 'updateLanguage' | 'updateFontSize'
>

export function createSettingsUiActions(context: SettingsStoreActionContext): SettingsUiActions {
  const { state, view } = context

  const updateTheme = (newTheme: 'light' | 'dark' | 'auto') => {
    view.theme.value = newTheme
    context.applyThemeClass()
  }

  const updateLanguage = async (newLanguage: string) => {
    state.language.value = newLanguage
    context.persistCurrentConfig()
  }

  const updateFontSize = (newSize: number) => {
    view.fontSize.value = newSize
  }

  return {
    updateTheme,
    updateLanguage,
    updateFontSize,
  }
}
