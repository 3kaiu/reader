import { computed } from 'vue'
import {
  READ_SETTINGS_CHINESE_OPTIONS,
  READ_SETTINGS_FONT_OPTIONS,
  READ_SETTINGS_FONT_WEIGHTS,
  READ_SETTINGS_THEME_OPTIONS,
} from '@/constants/readSettings'
import { useSettingsStore } from '@/stores/settings'
import type {
  ChineseConvert,
  FontFamily,
  ReaderTheme,
} from '@/types/settings'

export function useReadSettingsView() {
  const settingsStore = useSettingsStore()

  const customThemeBackground = computed(
    () => settingsStore.config.customColors.bg || '#FAF7ED'
  )
  const customThemeText = computed(
    () => settingsStore.config.customColors.text || '#333333'
  )
  const isCustomTheme = computed(() => settingsStore.config.theme === 'custom')

  const fontSizeValue = computed(() => [settingsStore.config.fontSize])
  const lineHeightValue = computed(() => [settingsStore.config.lineHeight])
  const paragraphSpacingValue = computed(() => [settingsStore.config.paragraphSpacing])
  const pageWidthValue = computed(() => [settingsStore.config.pageWidth])

  function resetConfig() {
    settingsStore.resetConfig()
  }

  function selectTheme(theme: ReaderTheme) {
    settingsStore.updateConfig('theme', theme)
  }

  function updateCustomBackground(value: string) {
    settingsStore.updateConfig('customColors', {
      ...settingsStore.config.customColors,
      bg: value,
    })
  }

  function updateCustomText(value: string) {
    settingsStore.updateConfig('customColors', {
      ...settingsStore.config.customColors,
      text: value,
    })
  }

  function selectFontFamily(fontFamily: FontFamily) {
    settingsStore.updateConfig('fontFamily', fontFamily)
  }

  function selectChineseConvert(value: ChineseConvert) {
    settingsStore.updateConfig('chineseConvert', value)
  }

  function updateFontSize(values: number[]) {
    settingsStore.updateConfig('fontSize', values[0] ?? 12)
  }

  function selectFontWeight(weight: number) {
    settingsStore.updateConfig('fontWeight', weight)
  }

  function updateLineHeight(values: number[]) {
    settingsStore.updateConfig('lineHeight', values[0] ?? 1.2)
  }

  function updateParagraphSpacing(values: number[]) {
    settingsStore.updateConfig('paragraphSpacing', values[0] ?? 0.5)
  }

  function updatePageWidth(values: number[]) {
    settingsStore.updateConfig('pageWidth', values[0] ?? 800)
  }

  function toggleAutoNightMode() {
    settingsStore.toggleAutoNightMode(!settingsStore.config.autoNightMode)
  }

  return {
    settingsStore,
    themes: READ_SETTINGS_THEME_OPTIONS,
    fonts: READ_SETTINGS_FONT_OPTIONS,
    chineseOptions: READ_SETTINGS_CHINESE_OPTIONS,
    fontWeights: READ_SETTINGS_FONT_WEIGHTS,
    isCustomTheme,
    customThemeBackground,
    customThemeText,
    fontSizeValue,
    lineHeightValue,
    paragraphSpacingValue,
    pageWidthValue,
    resetConfig,
    selectTheme,
    updateCustomBackground,
    updateCustomText,
    selectFontFamily,
    selectChineseConvert,
    updateFontSize,
    selectFontWeight,
    updateLineHeight,
    updateParagraphSpacing,
    updatePageWidth,
    toggleAutoNightMode,
  }
}
