/**
 * Settings Store
 *
 * Manages application settings and preferences
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { config } from '@/utils/unified-utils'

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<'light' | 'dark' | 'auto'>('auto')
  const language = ref<string>('zh-CN')
  const fontSize = ref<number>(16)
  const notifications = ref({
    enabled: true,
    sound: true,
    desktop: false,
  })
  const privacy = ref({
    analytics: true,
    crashReports: true,
    usageData: false,
  })

  const updateTheme = (newTheme: typeof theme.value) => {
    theme.value = newTheme
    // 应用主题
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  const updateLanguage = async (newLanguage: string) => {
    language.value = newLanguage
    // 这里可以重新加载语言包
  }

  const updateFontSize = (newSize: number) => {
    fontSize.value = Math.max(12, Math.min(32, newSize))
  }

  const updateNotifications = (settings: Partial<typeof notifications.value>) => {
    Object.assign(notifications.value, settings)
  }

  const updatePrivacy = (settings: Partial<typeof privacy.value>) => {
    Object.assign(privacy.value, settings)
  }

  // 从配置加载设置
  const loadFromConfig = () => {
    theme.value = config.get('ui.theme', 'auto') as 'light' | 'dark' | 'auto'
    language.value = config.get('ui.language', 'zh-CN') as string
    fontSize.value = config.get('reading.fontSize', 16) as number
  }

  // 保存到配置
  const saveToConfig = () => {
    config.set('ui.theme', theme.value)
    config.set('ui.language', language.value)
    config.set('reading.fontSize', fontSize.value)
  }

  return {
    theme,
    language,
    fontSize,
    notifications,
    privacy,
    updateTheme,
    updateLanguage,
    updateFontSize,
    updateNotifications,
    updatePrivacy,
    loadFromConfig,
    saveToConfig,
  }
})
