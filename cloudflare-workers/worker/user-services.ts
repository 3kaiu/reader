import {
  handleHealthCheck,
  handleUserStats,
  handlePopularContent,
  handleClientRoutingAnalytics,
  handleUserPreferences,
  handleContentUpload,
  handleUserBackup,
  handleClientMetrics,
} from './routes.ts'

import { AnalyticsSystem, UserPreferencesSystem, ContentManagementSystem, QueueProcessor } from './systems.ts'

import type { EnhancedWorkerEnv } from './types.ts'

export interface UserServiceContainer {
  getAnalytics(): AnalyticsSystem
  getUserPreferences(): UserPreferencesSystem
  getContentManagement(): ContentManagementSystem
  getQueueProcessor(): QueueProcessor
}

export function createUserServiceContainer(env: EnhancedWorkerEnv): UserServiceContainer {
  let analytics: AnalyticsSystem | undefined
  let userPreferences: UserPreferencesSystem | undefined
  let contentManagement: ContentManagementSystem | undefined
  let queueProcessor: QueueProcessor | undefined

  return {
    getAnalytics() {
      if (!analytics) analytics = new AnalyticsSystem(env)
      return analytics
    },
    getUserPreferences() {
      if (!userPreferences) userPreferences = new UserPreferencesSystem(env)
      return userPreferences
    },
    getContentManagement() {
      if (!contentManagement) contentManagement = new ContentManagementSystem(env)
      return contentManagement
    },
    getQueueProcessor() {
      if (!queueProcessor) queueProcessor = new QueueProcessor(env)
      return queueProcessor
    },
  }
}

export async function dispatchUserServiceRoute(
  request: Request,
  env: EnhancedWorkerEnv,
  services: UserServiceContainer
): Promise<Response | undefined> {
  const url = new URL(request.url)

  switch (url.pathname) {
    case '/api/health':
      return handleHealthCheck(request, env, services.getAnalytics())
    case '/api/analytics/user-stats':
      return handleUserStats(request, env, services.getAnalytics())
    case '/api/analytics/popular-content':
      return handlePopularContent(request, env, services.getAnalytics())
    case '/api/analytics/client-routing':
      return handleClientRoutingAnalytics(request, env)
    case '/api/preferences':
      return handleUserPreferences(request, env, services.getUserPreferences())
    case '/api/content/upload':
      return handleContentUpload(request, env, services.getContentManagement())
    case '/api/backup':
      return handleUserBackup(
        request,
        env,
        services.getContentManagement(),
        services.getQueueProcessor()
      )
    case '/api/metrics/client':
      return handleClientMetrics(request, env)
    default:
      return undefined
  }
}
