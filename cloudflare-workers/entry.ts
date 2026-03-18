/**
 * Worker entry (stable).
 *
 * This file is intentionally small:
 * - validate env bindings
 * - wire dependencies
 * - dispatch routes
 *
 * See `MODULE_BOUNDARIES.md` for dependency and ownership rules.
 *
 * Implementations live in `cloudflare-workers/worker/*`.
 */

import { handleCorsPreflightRequest, getCorsHeaders } from './shared/cors.ts'
import { createLogger } from './shared/logger.ts'
import { dispatchWithOptionalEdgeOptimization } from './src/entry-adapter.ts'

import type { EnhancedWorkerEnv } from './worker/types.ts'
import { requireBinding } from './worker/env.ts'
import { jsonError } from './worker/http.ts'
import { QueueProcessor } from './worker/systems.ts'
import { dispatchEdgeGatewayRoute } from './worker/edge-gateway.ts'
import { createUserServiceContainer, dispatchUserServiceRoute } from './worker/user-services.ts'

export default {
  async fetch(request: Request, env: EnhancedWorkerEnv, ctx: any): Promise<Response> {
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

    const userServices = createUserServiceContainer(env)

    if (request.method === 'OPTIONS') return handleCorsPreflightRequest(request)

    const dispatchStable = async (incomingRequest: Request): Promise<Response> => {
      const origin = incomingRequest.headers.get('Origin') || ''

      const gatewayResponse = await dispatchEdgeGatewayRoute(incomingRequest, env, ctx)
      if (gatewayResponse) {
        return gatewayResponse
      }

      const userServiceResponse = await dispatchUserServiceRoute(incomingRequest, env, userServices)
      if (userServiceResponse) {
        return userServiceResponse
      }

      return new Response('Not Found', { status: 404, headers: getCorsHeaders(origin) })
    }

    try {
      // Experimental optimizer is opt-in and always falls back to stable dispatch.
      return await dispatchWithOptionalEdgeOptimization(request, env, dispatchStable, logger)
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
