import { computed } from 'vue'
import type { ReaderActionOptions } from './action-types'

export function createReaderActionStyles(options: ReaderActionOptions) {
  const contentStyle = computed(() => ({
    fontSize: `${options.settingsStore.config.fontSize}px`,
    lineHeight: options.settingsStore.config.lineHeight,
    fontWeight: options.settingsStore.config.fontWeight,
    fontFamily: options.settingsStore.currentFontFamily,
    maxWidth: `${options.settingsStore.config.pageWidth}px`,
  }))

  const isNightMode = computed(() => options.settingsStore.config.theme === 'night')

  /**
   * 选择主题 — View Transitions 由 config.ts updateConfig 内部处理
   */
  const selectTheme = (theme: 'wechat' | 'mist' | 'night') => {
    options.settingsStore.updateConfig('theme', theme)
  }

  /**
   * 切换日/夜模式 — 仅 toggle wechat ↔ night
   */
  const toggleDayNight = () => {
    const next = isNightMode.value ? 'wechat' : 'night'
    selectTheme(next)
  }

  return {
    contentStyle,
    isNightMode,
    toggleDayNight,
    selectTheme,
  }
}
