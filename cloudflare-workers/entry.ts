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

import { handleCorsPreflightRequest } from './shared/cors.ts'
import { createLogger } from './shared/logger.ts'


import type { ExecutionContextLike, QueueBatchLike, WorkerQueueMessage } from './shared/types.ts'
import type { EnhancedWorkerEnv } from './worker/types.ts'
import { createAgentAwareDispatcher } from './entry/agent/dispatcher.ts'
import { createStableDispatcher } from './entry/dispatch.ts'
import { getErrorMessage } from './entry/errors.ts'
import { processQueueBatch } from './entry/queue.ts'
import { validateWorkerEnv } from './entry/validation.ts'
import { attachRequestId, ensureRequestId } from './worker/http.ts'
import { jsonError } from './worker/http.ts'
import { createUserServiceContainer } from './worker/user-services.ts'

export default {
  async fetch(request: Request, env: EnhancedWorkerEnv, ctx: ExecutionContextLike): Promise<Response> {
    const logger = createLogger(env)
    const { request: requestWithId, requestId } = ensureRequestId(request)

    try {
      validateWorkerEnv(env)
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      logger.error('Worker env validation failed:', error)
      return jsonError(requestWithId, 'MISCONFIGURED', 'Misconfigured worker', 500, errorMessage)
    }

    const userServices = createUserServiceContainer(env)

    if (requestWithId.method === 'OPTIONS') {
      return attachRequestId(handleCorsPreflightRequest(requestWithId), requestId)
    }

    const dispatchStable = createStableDispatcher(env, ctx, userServices)
    const dispatchAgentAware = createAgentAwareDispatcher(
      env,
      ctx,
      userServices,
      dispatchStable,
      logger
    )

    try {
      const response = await dispatchAgentAware(requestWithId)
      return attachRequestId(response, requestId)
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      logger.error('Request processing error:', error)
      return jsonError(
        requestWithId,
        'INTERNAL_ERROR',
        'Internal Server Error',
        500,
        env.ENVIRONMENT === 'development' ? errorMessage : undefined
      )
    }
  },

  async queue(batch: QueueBatchLike<WorkerQueueMessage>, env: EnhancedWorkerEnv): Promise<void> {
    await processQueueBatch(batch, env)
  }
}
