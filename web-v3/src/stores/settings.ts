import { defineStore } from 'pinia'
import { useStorage, useDark, useToggle } from '@vueuse/core'

export type ReaderTheme = 'light' | 'dark' | 'sepia' | 'green' | 'paper'

export const useSettingsStore = defineStore('settings', () => {
  // 使用 VueUse 的 useStorage 自动持久化
  const fontSize = useStorage('reader-fontSize', 18)
  const lineHeight = useStorage('reader-lineHeight', 1.8)
  const fontFamily = useStorage('reader-fontFamily', 'system-ui')
  const pageWidth = useStorage('reader-pageWidth', 800)
  const readerTheme = useStorage<ReaderTheme>('reader-theme', 'light')

  // 暗色模式
  const isDark = useDark()
  const toggleDark = useToggle(isDark)

  // 方法
  function setFontSize(size: number) {
    fontSize.value = Math.max(12, Math.min(32, size))
  }

  function setLineHeight(height: number) {
    lineHeight.value = Math.max(1.2, Math.min(3, height))
  }

  function setReaderTheme(theme: ReaderTheme) {
    readerTheme.value = theme
  }

  return {
    fontSize,
    lineHeight,
    fontFamily,
    pageWidth,
    readerTheme,
    isDark,
    toggleDark,
    setFontSize,
    setLineHeight,
    setReaderTheme,
  }
})
