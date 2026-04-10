import {
  handleContentUpload,
  handleUserBackup,
  handleUserPreferences,
} from '../routes/content.ts'
import {
  handleAgentRouterConfig,
  handleAgentRouterConfigAudit,
  handleAgentRouterStats,
  handleClientMetrics,
  handleClientRoutingAnalytics,
} from '../routes/analytics.ts'
import {
  handleFetchSessionAutoAcquire,
  handleFetchSessionVerify,
  handleSourceFlowAssist,
  handleSourceFlowAssistError,
  handleSourceFlowAssistFeedback,
  handleSourceFlowAssistFeedbackStats,
  handleSourceFlowAssistProfile,
  handleSourceFlowAssistProfileAudit,
  handleSourceFlowAssistProfileReset,
  handleSourceSessionProfile,
  handleSourceSessionProfileRecover,
} from '../routes/source-flow.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import type { UserServiceContainer } from './types.ts'

export async function dispatchUserServiceRoute(
  request: Request,
  env: EnhancedWorkerEnv,
  services: UserServiceContainer
): Promise<Response | undefined> {
  const url = new URL(request.url)

  switch (url.pathname) {
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
    case '/api/analytics/client-routing':
      return handleClientRoutingAnalytics(request, env)
    case '/api/agent/router-stats':
      return handleAgentRouterStats(request, env)
    case '/api/agent/config':
      return handleAgentRouterConfig(request, env)
    case '/api/agent/config/audit':
      return handleAgentRouterConfigAudit(request, env)
    case '/api/metrics/client':
      return handleClientMetrics(request, env)
    case '/api/source/flow-assist':
      try {
        return await handleSourceFlowAssist(request, env)
      } catch (error) {
        return handleSourceFlowAssistError(request, error)
      }
    case '/api/source/flow-assist/feedback':
      return handleSourceFlowAssistFeedback(request, env)
    case '/api/source/flow-assist/stats':
      return handleSourceFlowAssistFeedbackStats(request, env)
    case '/api/source/flow-assist/profile':
      return handleSourceFlowAssistProfile(request, env)
    case '/api/source/flow-assist/profile/reset':
      return handleSourceFlowAssistProfileReset(request, env)
    case '/api/source/flow-assist/profile/audit':
      return handleSourceFlowAssistProfileAudit(request, env)
    case '/api/fetch/session/auto-acquire':
      return handleFetchSessionAutoAcquire(request, env)
    case '/api/fetch/session/verify':
      return handleFetchSessionVerify(request, env)
    case '/api/source-session/profile':
      return handleSourceSessionProfile(request, env)
    case '/api/source-session/profile/recover':
      return handleSourceSessionProfileRecover(request, env)
    default:
      return undefined
  }
}
