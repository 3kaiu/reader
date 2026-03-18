/**
 * Unified State Management (Legacy)
 *
 * This file now serves as a re-export layer for backward compatibility.
 * Individual stores have been split into separate files:
 * - user.ts: User authentication and preferences
 * - reader.ts: Reading state and progress
 * - ai/store.ts: AI features and conversations
 * - settings.ts: Application settings
 * - statistics.ts: Reading and app statistics
 * - types.ts: Shared type definitions
 */

// Import stores for default export
import { useUserStore } from './user'
import { useReaderStore } from './reader'
import { useAiStore } from './ai/store'
import { useSettingsStore } from './settings'
import { useStatisticsStore } from './statistics'

// Re-export all stores
export { useUserStore } from './user'
export { useReaderStore } from './reader'
export { useAiStore } from './ai/store'
export { useSettingsStore } from './settings'
export { useStatisticsStore } from './statistics'

// Re-export all types
export type {
  User,
  UserPreferences,
  LoginCredentials,
  Book,
  Chapter,
  ReadingProgress,
  Bookmark,
  ReadingSettings,
  NotificationSettings,
  PrivacySettings,
  AiMessage,
} from './types'

// Default export for backward compatibility
export default {
  useUserStore,
  useReaderStore,
  useAiStore,
  useSettingsStore,
  useStatisticsStore,
}
