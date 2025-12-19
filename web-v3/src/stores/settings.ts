import { defineStore } from 'pinia'
import { useStorage, useDark, useToggle } from '@vueuse/core'
import { computed } from 'vue'

export type ReaderTheme = 'white' | 'paper' | 'sepia' | 'gray' | 'green' | 'night' | 'custom'
export type FontFamily = 'system' | 'heiti' | 'kaiti' | 'songti' | 'fangsong' | 'lxgw'
export type ReadingMode = 'scroll' | 'swipe'
export type ChineseConvert = 'none' | 'toSimplified' | 'toTraditional'

export interface ReaderConfig {
  // 字体
  fontSize: number
  fontWeight: number
  fontFamily: FontFamily
  chineseConvert: ChineseConvert
  // 排版
  lineHeight: number
  paragraphSpacing: number
  pageWidth: number
  // 主题
  theme: ReaderTheme
  customColors?: {
    background: string
    text: string
  }
  // 阅读方式
  readingMode: ReadingMode
  clickToNextPage: boolean
}

const defaultConfig: ReaderConfig = {
  fontSize: 18,
  fontWeight: 400,
  fontFamily: 'system',
  chineseConvert: 'none',
  lineHeight: 1.8,
  paragraphSpacing: 1.2,
  pageWidth: 800,
  theme: 'paper',
  readingMode: 'scroll',
  clickToNextPage: true,
}

export const useSettingsStore = defineStore('settings', () => {
  // 持久化配置
  const config = useStorage<ReaderConfig>('reader-config', defaultConfig)

  // 暗色模式
  const isDark = useDark()
  const toggleDark = useToggle(isDark)

  // 计算属性：当前主题配色
  const themeColors = computed(() => {
    const themes: Record<string, { bg: string; text: string }> = {
      white: { bg: '#FFFFFF', text: '#242424' },  // Clean White
      paper: { bg: '#FAF7ED', text: '#38342F' },  // Warm Paper
      sepia: { bg: '#EFE6D5', text: '#4A3B32' },  // Retro Sepia
      gray: { bg: '#F2F3F5', text: '#2B2B2B' },   // E-ink Gray
      green: { bg: '#E6F0E6', text: '#2E362C' },  // Soft Green
      night: { bg: '#1C1C1E', text: '#A1A1AA' },  // Optimized Dark
    }
    if (config.value.theme === 'custom' && config.value.customColors) {
      return config.value.customColors
    }
    return themes[config.value.theme] || themes.paper
  })

  // 字体映射
  const fontFamilyMap: Record<FontFamily, string> = {
    system: 'system-ui, -apple-system, sans-serif',
    heiti: '"PingFang SC", "Microsoft YaHei", sans-serif',
    kaiti: 'KaiTi, STKaiti, serif',
    songti: 'SimSun, STSong, serif',
    fangsong: 'FangSong, STFangsong, serif',
    lxgw: '"LXGW WenKai Screen", sans-serif',
  }

  const currentFontFamily = computed(() => fontFamilyMap[config.value.fontFamily] || fontFamilyMap.system)

  // 方法
  function updateConfig<K extends keyof ReaderConfig>(key: K, value: ReaderConfig[K]) {
    config.value = { ...config.value, [key]: value }
  }

  function resetConfig() {
    config.value = { ...defaultConfig }
  }

  function increaseFontSize() {
    updateConfig('fontSize', Math.min(32, config.value.fontSize + 1))
  }

  function decreaseFontSize() {
    updateConfig('fontSize', Math.max(12, config.value.fontSize - 1))
  }

  function increaseLineHeight() {
    updateConfig('lineHeight', Math.min(3, +(config.value.lineHeight + 0.1).toFixed(1)))
  }

  function decreaseLineHeight() {
    updateConfig('lineHeight', Math.max(1.2, +(config.value.lineHeight - 0.1).toFixed(1)))
  }

  return {
    config,
    isDark,
    toggleDark,
    themeColors,
    currentFontFamily,
    updateConfig,
    resetConfig,
    increaseFontSize,
    decreaseFontSize,
    increaseLineHeight,
    decreaseLineHeight,
  }
})
