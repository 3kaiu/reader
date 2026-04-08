import {
  handleClientMetrics,
  handleClientRoutingAnalytics,
  handleAgentRouterStats,
  handleAgentRouterConfig,
  handleAgentRouterConfigAudit,
  handleContentUpload,
  handleHealthCheck,
  handlePopularContent,
  handleUserBackup,
  handleUserPreferences,
  handleUserStats,
  handleSourceFlowAssist,
  handleSourceFlowAssistError,
  handleSourceFlowAssistFeedback,
} from '../routes.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import type { UserServiceContainer } from './types.ts'

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
    case '/api/agent/router-stats':
      return handleAgentRouterStats(request, env)
    case '/api/agent/config':
      return handleAgentRouterConfig(request, env)
    case '/api/agent/config/audit':
      return handleAgentRouterConfigAudit(request, env)
    case '/api/source/flow-assist':
      try {
        return await handleSourceFlowAssist(request, env)
      } catch (error) {
        return handleSourceFlowAssistError(request, error)
      }
    case '/api/source/flow-assist/feedback':
      return handleSourceFlowAssistFeedback(request, env)
    default:
      return undefined
  }
}
