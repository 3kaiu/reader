import {
  AnalyticsSystem,
  ContentManagementSystem,
  QueueProcessor,
  UserPreferencesSystem,
} from '../systems.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import type { UserServiceContainer } from './types.ts'

function createLazyServiceGetter<T>(factory: () => T): () => T {
  let instance: T | undefined

  return () => {
    if (!instance) {
      instance = factory()
    }

    return instance
  }
}

export function createUserServiceContainer(env: EnhancedWorkerEnv): UserServiceContainer {
  const getAnalytics = createLazyServiceGetter(() => new AnalyticsSystem(env))
  const getUserPreferences = createLazyServiceGetter(() => new UserPreferencesSystem(env))
  const getContentManagement = createLazyServiceGetter(() => new ContentManagementSystem(env))
  const getQueueProcessor = createLazyServiceGetter(() => new QueueProcessor(env))

  return {
    getAnalytics,
    getUserPreferences,
    getContentManagement,
    getQueueProcessor,
  }
}
