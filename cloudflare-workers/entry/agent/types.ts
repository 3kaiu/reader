import type { ExecutionContextLike } from '../../shared/types.ts'
import type { Logger } from '../../shared/logger.ts'
import type { EnhancedWorkerEnv } from '../../worker/types.ts'
import type { UserServiceContainer } from '../../worker/user-services.ts'

export type AgentDomain =
  | 'auth-sync'
  | 'decoder'
  | 'analytics'
  | 'library'
  | 'source'
  | 'core-reading'
  | 'addon'

export interface AgentConfig {
  enabled: boolean
  shadowMode: boolean
  aiMaxLatencyMs: number
  minConfidence: number
  allowAISelection: boolean
  rolloutPercent: number
  includeRoutes: string[]
  excludeRoutes: string[]
}

export interface AgentContext {
  request: Request
  url: URL
  env: EnhancedWorkerEnv
  ctx: ExecutionContextLike
  userServices: UserServiceContainer
  logger: Logger
}

export interface SkillDescriptor {
  id: string
  domain: AgentDomain
  description: string
  patterns: string[]
  methods?: string[]
  execute(context: AgentContext): Promise<Response | undefined>
}

export interface SkillCandidate {
  skill: SkillDescriptor
  score: number
}

export type SelectionStrategy = 'rule' | 'ai' | 'ai-low-confidence' | 'ai-timeout' | 'ai-failed'

export interface SkillSelection {
  skill: SkillDescriptor
  strategy: SelectionStrategy
  confidence?: number
}
