import type { Logger } from '../../shared/logger.ts'
import type { ExecutionContextLike } from '../../shared/types.ts'
import type { EnhancedWorkerEnv } from '../../worker/types.ts'
import type { UserServiceContainer } from '../../worker/user-services.ts'
import { buildAgentConfig } from './config.ts'
import { describeSelection, selectSkill } from './router.ts'

type StableDispatcher = (request: Request) => Promise<Response>

async function recordAgentDecision(
  env: EnhancedWorkerEnv,
  request: Request,
  data: { skillId: string; strategy: string; confidence?: number }
): Promise<void> {
  const method = request.method
  const pathname = new URL(request.url).pathname
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0

  try {
    await env.ANALYTICS_ENGINE.writeDataPoint({
      blobs: ['agent', data.strategy, data.skillId, method, pathname],
      doubles: [confidence, 1],
      indexes: ['agent_router'],
    })
  } catch {
    // ignore telemetry errors
  }
}

function runTelemetry(
  env: EnhancedWorkerEnv,
  ctx: ExecutionContextLike,
  request: Request,
  data: { skillId: string; strategy: string; confidence?: number }
) {
  const task = recordAgentDecision(env, request, data)
  ctx.waitUntil(task)
}

export function createAgentAwareDispatcher(
  env: EnhancedWorkerEnv,
  ctx: ExecutionContextLike,
  userServices: UserServiceContainer,
  dispatchStable: StableDispatcher,
  logger: Logger
) {
  const annotateResponse = (response: Response, strategy: string, skillId: string): Response => {
    const headers = new Headers(response.headers)
    headers.set('X-Agent-Strategy', strategy)
    headers.set('X-Agent-Skill', skillId)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  return async function dispatchAgentAware(request: Request): Promise<Response> {
    const config = await buildAgentConfig(env)

    if (!config.enabled && !config.shadowMode) {
      return dispatchStable(request)
    }

    const url = new URL(request.url)
    const selection = await selectSkill(request, env, config, logger)
    if (!selection) {
      return dispatchStable(request)
    }

    runTelemetry(env, ctx, request, describeSelection(selection))

    if (config.shadowMode) {
      logger.info(
        `Agent shadow selection skill=${selection.skill.id} strategy=${selection.strategy} path=${url.pathname}`
      )
      return dispatchStable(request)
    }

    try {
      const response = await selection.skill.execute({
        request,
        url,
        env,
        ctx,
        userServices,
        logger,
      })
      if (response) {
        return annotateResponse(response, selection.strategy, selection.skill.id)
      }
    } catch (error) {
      logger.warn(`Agent skill execution failed, fallback to stable dispatcher: ${selection.skill.id}`, error)
    }

    return dispatchStable(request)
  }
}
