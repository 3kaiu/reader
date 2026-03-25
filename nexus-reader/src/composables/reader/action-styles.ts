import { computed } from 'vue'
import type { ReaderActionOptions } from './action-types'

export function createReaderActionStyles(options: ReaderActionOptions) {
  const contentStyle = computed(() => ({
    fontSize: `${options.settingsStore.config.fontSize}px`,
    lineHeight: options.settingsStore.config.lineHeight,
    fontWeight: options.settingsStore.config.fontWeight,
    fontFamily: options.settingsStore.currentFontFamily,
    color: options.settingsStore.themeColors.text,
    maxWidth: `${options.settingsStore.config.pageWidth}px`,
    '--custom-bg': options.settingsStore.themeColors.bg,
    '--custom-text': options.settingsStore.themeColors.text,
  }))

  const readerThemeStyle = computed(() =>
    options.settingsStore.config.theme === 'custom'
      ? {
          backgroundColor: options.settingsStore.config.customColors.bg,
          color: options.settingsStore.config.customColors.text,
        }
      : {}
  )

  const isNightMode = computed(() => options.settingsStore.config.theme === 'night')

  const toggleDayNight = () => {
    options.settingsStore.updateConfig(
      'theme',
      isNightMode.value ? 'white' : 'night',
    )
  }

  return {
    contentStyle,
    readerThemeStyle,
    isNightMode,
    toggleDayNight,
  }
}
