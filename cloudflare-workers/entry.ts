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
import { dispatchWithOptionalEdgeOptimization } from './src/entry-adapter.ts'

import type { ExecutionContextLike, QueueBatchLike, WorkerQueueMessage } from './shared/types.ts'
import type { EnhancedWorkerEnv } from './worker/types.ts'
import { createStableDispatcher } from './entry/dispatch.ts'
import { getErrorMessage } from './entry/errors.ts'
import { processQueueBatch } from './entry/queue.ts'
import { validateWorkerEnv } from './entry/validation.ts'
import { jsonError } from './worker/http.ts'
import { createUserServiceContainer } from './worker/user-services.ts'

export default {
  async fetch(request: Request, env: EnhancedWorkerEnv, ctx: ExecutionContextLike): Promise<Response> {
    const logger = createLogger(env)

    try {
      validateWorkerEnv(env)
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      logger.error('Worker env validation failed:', error)
      return jsonError(request, 'MISCONFIGURED', 'Misconfigured worker', 500, errorMessage)
    }

    const userServices = createUserServiceContainer(env)

    if (request.method === 'OPTIONS') return handleCorsPreflightRequest(request)

    const dispatchStable = createStableDispatcher(env, ctx, userServices)

    try {
      // Experimental optimizer is opt-in and always falls back to stable dispatch.
      return await dispatchWithOptionalEdgeOptimization(request, env, dispatchStable, logger)
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      logger.error('Request processing error:', error)
      return jsonError(
        request,
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
