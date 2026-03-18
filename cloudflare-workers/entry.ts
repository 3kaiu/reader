/**
 * Worker entry (stable).
 *
 * This file is intentionally small:
 * - validate env bindings
 * - wire dependencies
 * - dispatch routes
 *
 * Implementations live in `cloudflare-workers/worker/*`.
 */

import { handleCorsPreflightRequest, getCorsHeaders } from './shared/cors.ts'
import { proxyRequestWithEnv } from './shared/proxy.ts'
import { createLogger } from './shared/logger.ts'

import type { EnhancedWorkerEnv } from './worker/types.ts'
import { requireBinding } from './worker/env.ts'
import { jsonError } from './worker/http.ts'
import { AnalyticsSystem, UserPreferencesSystem, ContentManagementSystem, QueueProcessor } from './worker/systems.ts'
import {
  handleHealthCheck,
  handleUserStats,
  handlePopularContent,
  handleClientRoutingAnalytics,
  handleUserPreferences,
  handleContentUpload,
  handleUserBackup,
  handleClientMetrics,
  handleGitHubLogin,
  handleGitHubCallback,
  handleAuthVerify,
  handleDecodeRequest,
  handleProgressSync,
} from './worker/routes.ts'

export default {
  async fetch(request: Request, env: EnhancedWorkerEnv, ctx: any): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''
    const logger = createLogger(env)

    try {
      requireBinding(env, 'AUTH_SECRET')
      requireBinding(env, 'ANALYTICS_ENGINE')
      requireBinding(env, 'ANALYTICS_DB')
      requireBinding(env, 'USER_PREFERENCES_DB')
      requireBinding(env, 'USER_CONTENT_R2')
      requireBinding(env, 'BACKUP_R2')
      requireBinding(env, 'PROGRESS_KV', { requiredInProd: true })
    } catch (e: any) {
      logger.error('Worker env validation failed:', e?.message || e)
      return jsonError(request, 'MISCONFIGURED', 'Misconfigured worker', 500, e?.message || String(e))
    }

    const analytics = new AnalyticsSystem(env)
    const userPrefs = new UserPreferencesSystem(env)
    const contentManager = new ContentManagementSystem(env)
    const queueProcessor = new QueueProcessor(env)

    if (request.method === 'OPTIONS') return handleCorsPreflightRequest(request)

    try {
      switch (url.pathname) {
        case '/auth/github':
          return await handleGitHubLogin(request, env)
        case '/auth/github/callback':
          return await handleGitHubCallback(request, env)
        case '/auth/verify':
          return await handleAuthVerify(request, env)

        case '/api/health':
          return await handleHealthCheck(request, env, analytics)
        case '/api/analytics/user-stats':
          return await handleUserStats(request, env, analytics)
        case '/api/analytics/popular-content':
          return await handlePopularContent(request, env, analytics)
        case '/api/analytics/client-routing':
          return await handleClientRoutingAnalytics(request, env)
        case '/api/preferences':
          return await handleUserPreferences(request, env, userPrefs)
        case '/api/content/upload':
          return await handleContentUpload(request, env, contentManager)
        case '/api/backup':
          return await handleUserBackup(request, env, contentManager, queueProcessor)
        case '/api/metrics/client':
          return await handleClientMetrics(request, env)

        default: {
          if (url.pathname.startsWith('/api/')) return await proxyRequestWithEnv(request, env as any, ctx)
          if (url.pathname.startsWith('/decode/')) return await handleDecodeRequest(request, env)
          if (url.pathname.startsWith('/progress/')) return await handleProgressSync(request, env, url)
          return new Response('Not Found', { status: 404, headers: getCorsHeaders(origin) })
        }
      }
    } catch (err: any) {
      logger.error('Request processing error:', err)
      return jsonError(
        request,
        'INTERNAL_ERROR',
        'Internal Server Error',
        500,
        env.ENVIRONMENT === 'development' ? err?.message : undefined
      )
    }
  },

  async queue(batch: any, env: EnhancedWorkerEnv): Promise<void> {
    const queueProcessor = new QueueProcessor(env)
    for (const message of batch.messages) {
      await queueProcessor.processQueueMessage(message.body)
    }
  }
}

