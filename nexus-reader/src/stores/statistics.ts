/**
 * Statistics Store
 *
 * Manages reading and application statistics
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

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
