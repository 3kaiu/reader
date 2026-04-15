/**
 * Worker entry (stable).
 *
 * This file is intentionally small:
 * - validate env bindings
 * - wire dependencies
 * - dispatch routes
 *
 * Implementations live in `edge/worker/*`.
 */

import { handleCorsPreflightRequest } from './shared/cors.ts'
import { createLogger } from './shared/logger.ts'
import type { ExecutionContextLike } from './shared/types.ts'
import type { EnhancedWorkerEnv } from './worker/types.ts'
import { createStableDispatcher } from './entry/dispatch.ts'
import { getErrorMessage } from './entry/errors.ts'
import { validateWorkerEnv } from './entry/validation.ts'
import { attachRequestId, ensureRequestId } from './shared/request-id.ts'
import { jsonError } from './worker/http.ts'

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

    if (requestWithId.method === 'OPTIONS') {
      return attachRequestId(handleCorsPreflightRequest(requestWithId, env), requestId)
    }

    const dispatchStable = createStableDispatcher(env, ctx)

    try {
      const response = await dispatchStable(requestWithId)
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
}
