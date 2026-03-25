import type {
  AnalyticsSystem,
  ContentManagementSystem,
  QueueProcessor,
  UserPreferencesSystem,
} from '../systems.ts'

export interface UserServiceContainer {
  getAnalytics(): AnalyticsSystem
  getUserPreferences(): UserPreferencesSystem
  getContentManagement(): ContentManagementSystem
  getQueueProcessor(): QueueProcessor
}
