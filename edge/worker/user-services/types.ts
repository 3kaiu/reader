import type {

  ContentManagementSystem,
  QueueProcessor,
  UserPreferencesSystem,
} from '../systems.ts'

export interface UserServiceContainer {

  getUserPreferences(): UserPreferencesSystem
  getContentManagement(): ContentManagementSystem
  getQueueProcessor(): QueueProcessor
}
