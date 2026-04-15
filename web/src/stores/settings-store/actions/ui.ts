import type { SettingsStoreActions } from '../types'
import type { SettingsStoreActionContext } from './helpers'

type SettingsUiActions = Pick<
  SettingsStoreActions,
  'updateTheme' | 'updateLanguage' | 'updateFontSize' | 'updateNotifications' | 'updatePrivacy'
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

  const updateNotifications = (settings: Partial<typeof state.notifications.value>) => {
    Object.assign(state.notifications.value, settings)
  }

  const updatePrivacy = (settings: Partial<typeof state.privacy.value>) => {
    Object.assign(state.privacy.value, settings)
  }

  return {
    updateTheme,
    updateLanguage,
    updateFontSize,
    updateNotifications,
    updatePrivacy,
  }
}
