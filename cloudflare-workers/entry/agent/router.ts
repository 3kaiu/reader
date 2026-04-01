import type { Logger } from '../../shared/logger.ts'
import type { EnhancedWorkerEnv } from '../../worker/types.ts'
import { buildAgentSkills, collectSkillCandidates } from './skills.ts'
import type {
  AgentConfig,
  AgentDomain,
  SelectionStrategy,
  SkillCandidate,
  SkillSelection,
} from './types.ts'

const DOMAIN_PREFIX_RULES: Array<{ domain: AgentDomain; prefixes: string[] }> = [
  { domain: 'auth-sync', prefixes: ['/auth/', '/progress/'] },
  { domain: 'decoder', prefixes: ['/decode/'] },
  { domain: 'analytics', prefixes: ['/api/health', '/api/analytics/', '/api/agent/', '/api/metrics/client'] },
  { domain: 'library', prefixes: ['/api/bookshelf', '/api/groups'] },
  { domain: 'source', prefixes: ['/api/sources', '/api/replace_rules'] },
  { domain: 'core-reading', prefixes: ['/api/search', '/api/book', '/api/chapters', '/api/content', '/api/batch/content'] },
  { domain: 'addon', prefixes: ['/api/preferences', '/api/content/upload', '/api/backup'] },
]

function classifyDomain(pathname: string): AgentDomain {
  for (const rule of DOMAIN_PREFIX_RULES) {
    if (rule.prefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix))) {
      return rule.domain
    }
  }
  return 'core-reading'
}

function matchRoute(pathname: string, rule: string): boolean {
  if (rule === '*') return true
  if (rule.endsWith('*')) {
    return pathname.startsWith(rule.slice(0, -1))
  }
  if (pathname === rule) return true
  const prefix = rule.endsWith('/') ? rule : `${rule}/`
  return pathname.startsWith(prefix)
}

function deterministicPercent(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash % 100
}

function shouldRunAgent(request: Request, config: AgentConfig): boolean {
  const forcedByHeader = request.headers.get('X-Agent-Experimental') === '1'
  if (forcedByHeader) return true

  const url = new URL(request.url)
  const pathname = url.pathname
  const isReadRequest = request.method === 'GET' || request.method === 'HEAD' || request.method === 'POST'
  if (!isReadRequest) return false

  if (config.includeRoutes.length > 0) {
    const included = config.includeRoutes.some(rule => matchRoute(pathname, rule))
    if (!included) return false
  }

  if (config.excludeRoutes.length > 0) {
    const excluded = config.excludeRoutes.some(rule => matchRoute(pathname, rule))
    if (excluded) return false
  }

  if (config.rolloutPercent <= 0) return false
  if (config.rolloutPercent >= 100) return true

  const seed =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Request-ID') ||
    request.url
  return deterministicPercent(seed) < config.rolloutPercent
}

function pickByRules(candidates: SkillCandidate[]): SkillSelection | null {
  const top = candidates[0]
  if (!top) return null
  return { skill: top.skill, strategy: 'rule' }
}

function parseAIResponse(raw: unknown): { skillId?: string; confidence?: number } | null {
  if (typeof raw === 'object' && raw && 'response' in raw) {
    return parseAIResponse((raw as { response?: unknown }).response)
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return null
  }

  const direct = safeJsonParse(raw)
  if (direct) return direct

  const matched = raw.match(/\{[\s\S]*\}/)
  if (!matched) return null
  return safeJsonParse(matched[0])
}

function safeJsonParse(input: string): { skillId?: string; confidence?: number } | null {
  try {
    const parsed = JSON.parse(input) as { skillId?: unknown; confidence?: unknown }
    const skillId = typeof parsed.skillId === 'string' ? parsed.skillId : undefined
    const confidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? parsed.confidence
        : undefined
    return { skillId, confidence }
  } catch {
    return null
  }
}

async function rankByAI(
  env: EnhancedWorkerEnv,
  request: Request,
  domain: AgentDomain,
  candidates: SkillCandidate[],
  config: AgentConfig,
  logger: Logger
): Promise<SkillSelection | null> {
  if (!config.allowAISelection || !env.AI || candidates.length <= 1) return null

  const url = new URL(request.url)
  const prompt = [
    'You are a strict skill router.',
    'Pick one skill id from candidates based on method and pathname.',
    'Return only JSON: {"skillId":"<id>","confidence":0.0}',
    `Domain: ${domain}`,
    `Method: ${request.method}`,
    `Pathname: ${url.pathname}`,
    `Candidates: ${JSON.stringify(candidates.map(c => ({
      id: c.skill.id,
      description: c.skill.description,
      score: c.score,
    })))}`,
  ].join('\n')

  try {
    const response = await Promise.race([
      env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        prompt,
        max_tokens: 120,
        temperature: 0,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI_TIMEOUT')), config.aiMaxLatencyMs)
      }),
    ])

    const parsed = parseAIResponse(response)
    if (!parsed?.skillId) return null

    const selected = candidates.find(c => c.skill.id === parsed.skillId)
    if (!selected) return null

    const confidence = parsed.confidence ?? 0
    if (confidence < config.minConfidence) {
      return { skill: selected.skill, strategy: 'ai-low-confidence', confidence }
    }

    return { skill: selected.skill, strategy: 'ai', confidence }
  } catch (error) {
    if (error instanceof Error && error.message === 'AI_TIMEOUT') {
      return { skill: candidates[0].skill, strategy: 'ai-timeout' }
    }
    logger.warn('Agent AI ranking failed, fallback to rules', error)
    return { skill: candidates[0].skill, strategy: 'ai-failed' }
  }
}

export async function selectSkill(
  request: Request,
  env: EnhancedWorkerEnv,
  config: AgentConfig,
  logger: Logger
): Promise<SkillSelection | null> {
  if (!shouldRunAgent(request, config)) {
    return null
  }

  const allSkills = buildAgentSkills()
  const pathname = new URL(request.url).pathname
  const domain = classifyDomain(pathname)

  const allCandidates = collectSkillCandidates(request, allSkills)
  if (allCandidates.length === 0) return null

  const domainCandidates = allCandidates.filter(c => c.skill.domain === domain)
  const effectiveCandidates = domainCandidates.length > 0 ? domainCandidates : allCandidates

  const ruleSelection = pickByRules(effectiveCandidates)
  if (!ruleSelection) return null
  if (!config.enabled && !config.shadowMode) return ruleSelection

  const aiSelection = await rankByAI(env, request, domain, effectiveCandidates, config, logger)
  if (!aiSelection) return ruleSelection
  if (aiSelection.strategy === 'ai-low-confidence') return ruleSelection
  return aiSelection
}

export function describeSelection(selection: SkillSelection): {
  skillId: string
  strategy: SelectionStrategy
  confidence?: number
} {
  return {
    skillId: selection.skill.id,
    strategy: selection.strategy,
    confidence: selection.confidence,
  }
}
