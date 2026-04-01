import { getEffectiveAgentConfig } from '../../shared/agent-config.ts'
import type { EnhancedWorkerEnv } from '../../worker/types.ts'
import type { AgentConfig } from './types.ts'

export async function buildAgentConfig(env: EnhancedWorkerEnv): Promise<AgentConfig> {
  const { config } = await getEffectiveAgentConfig(env)
  return config
}
