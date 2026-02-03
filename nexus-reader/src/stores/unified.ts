/**
 * 统一状态管理
 *
 * 将所有Pinia stores聚合到一个文件中：
 * - 用户状态管理
 * - 阅读器状态管理
 * - AI功能状态管理
 * - 设置状态管理
 * - 统计状态管理
 */

import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import { api, config, errorHandler } from '@/utils/unified-utils'

// ===== 用户状态管理 =====

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const preferences = ref<UserPreferences | null>(null)
  const isAuthenticated = computed(() => !!user.value)
  const isLoading = ref(false)

  const login = async (credentials: LoginCredentials) => {
    isLoading.value = true
    try {
      // 这里应该调用API
      // const response = await api.post('/auth/login', credentials)
      // user.value = response.data.user
      // preferences.value = response.data.preferences
      console.log('Login with:', credentials)
    } catch (error) {
      errorHandler.handle(error, { component: 'user-store', operation: 'login' })
    } finally {
      isLoading.value = false
    }
  }

  const logout = async () => {
    try {
      // const response = await api.post('/auth/logout')
      user.value = null
      preferences.value = null
    } catch (error) {
      errorHandler.handle(error, { component: 'user-store', operation: 'logout' })
    }
  }

  const updatePreferences = async (newPreferences: Partial<UserPreferences>) => {
    try {
      if (preferences.value) {
        Object.assign(preferences.value, newPreferences)
        // await api.put('/user/preferences', preferences.value)
      }
    } catch (error) {
      errorHandler.handle(error, { component: 'user-store', operation: 'update-preferences' })
    }
  }

  return {
    user,
    preferences,
    isAuthenticated,
    isLoading,
    login,
    logout,
    updatePreferences,
  }
})

// ===== 阅读器状态管理 =====

export const useReaderStore = defineStore('reader', () => {
  const currentBook = ref<Book | null>(null)
  const currentChapter = ref<Chapter | null>(null)
  const readingProgress = ref<ReadingProgress | null>(null)
  const bookmarks = ref<Bookmark[]>([])
  const readingSettings = ref<ReadingSettings | null>(null)
  const isLoading = ref(false)

  const loadBook = async (bookId: string) => {
    isLoading.value = true
    try {
      // const response = await api.get(`/books/${bookId}`)
      // currentBook.value = response.data
      console.log('Loading book:', bookId)
    } catch (error) {
      errorHandler.handle(error, { component: 'reader-store', operation: 'load-book' })
    } finally {
      isLoading.value = false
    }
  }

  const loadChapter = async (chapterId: string) => {
    isLoading.value = true
    try {
      // const response = await api.get(`/chapters/${chapterId}`)
      // currentChapter.value = response.data
      console.log('Loading chapter:', chapterId)
    } catch (error) {
      errorHandler.handle(error, { component: 'reader-store', operation: 'load-chapter' })
    } finally {
      isLoading.value = false
    }
  }

  const updateProgress = async (progress: ReadingProgress) => {
    try {
      readingProgress.value = progress
      // await api.put('/reading/progress', progress)
    } catch (error) {
      errorHandler.handle(error, { component: 'reader-store', operation: 'update-progress' })
    }
  }

  const addBookmark = async (bookmark: Omit<Bookmark, 'id'>) => {
    try {
      const newBookmark: Bookmark = {
        id: crypto.randomUUID(),
        ...bookmark,
      }
      bookmarks.value.push(newBookmark)
      // await api.post('/bookmarks', newBookmark)
    } catch (error) {
      errorHandler.handle(error, { component: 'reader-store', operation: 'add-bookmark' })
    }
  }

  const updateSettings = async (settings: ReadingSettings) => {
    try {
      readingSettings.value = settings
      // await api.put('/reading/settings', settings)
    } catch (error) {
      errorHandler.handle(error, { component: 'reader-store', operation: 'update-settings' })
    }
  }

  return {
    currentBook,
    currentChapter,
    readingProgress,
    bookmarks,
    readingSettings,
    isLoading,
    loadBook,
    loadChapter,
    updateProgress,
    addBookmark,
    updateSettings,
  }
})

// ===== AI功能状态管理 =====

export const useAiStore = defineStore('ai', () => {
  const isEnabled = ref(true)
  const currentModel = ref<string>('gpt-3.5-turbo')
  const conversationHistory = ref<AiMessage[]>([])
  const isProcessing = ref(false)
  const analysisResults = ref<Record<string, any>>({})

  const sendMessage = async (message: string, context?: string) => {
    if (!isEnabled.value) return

    isProcessing.value = true
    try {
      const userMessage: AiMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        timestamp: Date.now(),
      }
      conversationHistory.value.push(userMessage)

      // const response = await api.post('/ai/chat', {
      //   message,
      //   context,
      //   model: currentModel.value,
      //   history: conversationHistory.value.slice(-10), // 最近10条消息
      // })

      // const aiMessage: AiMessage = {
      //   id: crypto.randomUUID(),
      //   role: 'assistant',
      //   content: response.data.content,
      //   timestamp: Date.now(),
      // }
      // conversationHistory.value.push(aiMessage)

      console.log('AI message sent:', message)
    } catch (error) {
      errorHandler.handle(error, { component: 'ai-store', operation: 'send-message' })
    } finally {
      isProcessing.value = false
    }
  }

  const analyzeContent = async (content: string, type: string) => {
    isProcessing.value = true
    try {
      // const response = await api.post('/ai/analyze', { content, type })
      // analysisResults.value[type] = response.data
      console.log('Analyzing content:', type, content.substring(0, 100))
    } catch (error) {
      errorHandler.handle(error, { component: 'ai-store', operation: 'analyze-content' })
    } finally {
      isProcessing.value = false
    }
  }

  const clearHistory = () => {
    conversationHistory.value = []
  }

  const switchModel = (model: string) => {
    currentModel.value = model
  }

  return {
    isEnabled,
    currentModel,
    conversationHistory,
    isProcessing,
    analysisResults,
    sendMessage,
    analyzeContent,
    clearHistory,
    switchModel,
  }
})

// ===== 设置状态管理 =====

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
    theme.value = config.get('ui.theme', 'auto')
    language.value = config.get('ui.language', 'zh-CN')
    fontSize.value = config.get('reading.fontSize', 16)
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

// ===== 统计状态管理 =====

export const useStatisticsStore = defineStore('statistics', () => {
  const readingStats = ref({
    totalBooks: 0,
    totalChapters: 0,
    totalReadingTime: 0, // 分钟
    averageSessionTime: 0,
    completionRate: 0,
    favoriteGenres: [] as string[],
    readingStreak: 0,
  })

  const appStats = ref({
    totalSessions: 0,
    averageSessionDuration: 0,
    crashCount: 0,
    lastCrash: null as Date | null,
    featureUsage: {} as Record<string, number>,
  })

  const updateReadingStats = (stats: Partial<typeof readingStats.value>) => {
    Object.assign(readingStats.value, stats)
  }

  const updateAppStats = (stats: Partial<typeof appStats.value>) => {
    Object.assign(appStats.value, stats)
  }

  const recordFeatureUsage = (feature: string) => {
    appStats.value.featureUsage[feature] = (appStats.value.featureUsage[feature] || 0) + 1
  }

  const recordCrash = () => {
    appStats.value.crashCount++
    appStats.value.lastCrash = new Date()
  }

  return {
    readingStats,
    appStats,
    updateReadingStats,
    updateAppStats,
    recordFeatureUsage,
    recordCrash,
  }
})

// ===== 类型定义 =====

export interface User {
  id: string
  username: string
  email: string
  displayName?: string
  avatar?: string
  role: 'reader' | 'premium' | 'admin'
  createdAt: Date
  lastLoginAt?: Date
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: string
  timezone: string
  reading: ReadingSettings
  notifications: NotificationSettings
  privacy: PrivacySettings
}

export interface LoginCredentials {
  username: string
  password: string
  remember?: boolean
}

export interface Book {
  id: string
  title: string
  author: string
  cover?: string
  description?: string
  genres: string[]
  status: 'ongoing' | 'completed' | 'hiatus'
  chapters: Chapter[]
  progress?: ReadingProgress
}

export interface Chapter {
  id: string
  title: string
  content?: string
  order: number
  wordCount?: number
}

export interface ReadingProgress {
  bookId: string
  chapterId: string
  position: number // 0-100
  scrollTop: number
  timestamp: number
  completed: boolean
}

export interface Bookmark {
  id: string
  chapterId: string
  position: number
  note?: string
  createdAt: Date
}

export interface ReadingSettings {
  fontSize: number
  fontFamily: string
  lineHeight: number
  theme: 'light' | 'dark' | 'auto'
  pageWidth: number
  autoScroll: boolean
  scrollSpeed: number
}

export interface NotificationSettings {
  enabled: boolean
  sound: boolean
  desktop: boolean
  email?: boolean
}

export interface PrivacySettings {
  analytics: boolean
  crashReports: boolean
  usageData: boolean
}

export interface AiMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  metadata?: Record<string, any>
}

// ===== 默认导出 =====

export default {
  useUserStore,
  useReaderStore,
  useAiStore,
  useSettingsStore,
  useStatisticsStore,
}