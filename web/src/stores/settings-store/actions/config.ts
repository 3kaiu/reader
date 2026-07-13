import { cloneDefaultConfig, isInNightWindow } from '@/stores/settings-store/helpers'
import type { ReaderConfig } from '@/types/settings'
import type { SettingsStoreActions } from '../types'
import { assignSettingsConfigValue, type SettingsStoreActionContext } from './helpers'

type SettingsConfigActions = Pick<
  SettingsStoreActions,
  | 'updateConfig'
  | 'resetConfig'
  | 'increaseFontSize'
  | 'decreaseFontSize'
  | 'increaseLineHeight'
  | 'decreaseLineHeight'
  | 'toggleAutoNightMode'
  | 'applyAutoNightMode'
>

export function createSettingsConfigActions(
  context: SettingsStoreActionContext
): SettingsConfigActions {
  const { state } = context

  const updateConfig = <K extends keyof ReaderConfig>(key: K, value: ReaderConfig[K]) => {
    const prevTheme = state.config.theme
    assignSettingsConfigValue(state.config, key, value)
    // View Transitions API 增强主题切换体验
    if (key === 'theme' && prevTheme !== value && document.startViewTransition) {
      document.startViewTransition(() => context.applyThemeClass())
    } else {
      context.applyThemeClass()
    }
    context.persistCurrentConfig()
  }

  const resetConfig = () => {
    Object.assign(state.config, cloneDefaultConfig())
    context.applyThemeClass()
    context.persistCurrentConfig()
  }

  const increaseFontSize = () => updateConfig('fontSize', state.config.fontSize + 1)

  const decreaseFontSize = () => updateConfig('fontSize', state.config.fontSize - 1)

  const increaseLineHeight = () =>
    updateConfig('lineHeight', Number((state.config.lineHeight + 0.1).toFixed(1)))

  const decreaseLineHeight = () =>
    updateConfig('lineHeight', Number((state.config.lineHeight - 0.1).toFixed(1)))

  const applyAutoNightMode = () => {
    if (!state.config.autoNightMode) {
      context.applyThemeClass()
      return
    }

    const hour = new Date().getHours()
    const nightMode = isInNightWindow(
      hour,
      state.config.nightModeStartHour,
      state.config.nightModeEndHour
    )

    updateConfig('theme', nightMode ? 'night' : 'wechat')
  }

  const toggleAutoNightMode = (enabled: boolean) => {
    updateConfig('autoNightMode', enabled)
    if (enabled) {
      applyAutoNightMode()
    }
  }

  return {
    updateConfig,
    resetConfig,
    increaseFontSize,
    decreaseFontSize,
    increaseLineHeight,
    decreaseLineHeight,
    toggleAutoNightMode,
    applyAutoNightMode,
  }
}
