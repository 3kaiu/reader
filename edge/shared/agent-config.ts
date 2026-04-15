import type { KVNamespaceLike } from './types.ts'

const AGENT_CONFIG_OVERRIDE_KEY = 'agent:config:override:v1'
const AGENT_CONFIG_AUDIT_KEY = 'agent:config:audit:v1'
const MAX_AUDIT_RECORDS = 100

export interface AgentRuntimeConfig {
  enabled: boolean
  shadowMode: boolean
  allowAISelection: boolean
  aiMaxLatencyMs: number
  minConfidence: number
  rolloutPercent: number
  includeRoutes: string[]
  excludeRoutes: string[]
}

export interface AgentConfigPatch {
  enabled?: boolean
  shadowMode?: boolean
  allowAISelection?: boolean
  aiMaxLatencyMs?: number
  minConfidence?: number
  rolloutPercent?: number
  includeRoutes?: string[]
  excludeRoutes?: string[]
}

export interface AgentConfigAuditRecord {
  id: string
  action: 'patch' | 'reset'
  actorId?: string
  timestamp: string
  patch?: AgentConfigPatch
  changes: Array<{
    field: keyof AgentRuntimeConfig
    before: unknown
    after: unknown
  }>
}

interface AgentConfigOverrideEnvelope {
  config: AgentConfigPatch
  updatedAt: string
  updatedBy?: string
}

type AgentEnvLike = {
  AGENT_ENABLED?: string
  AGENT_SHADOW_MODE?: string
  AGENT_AI_ENABLED?: string
  AGENT_AI_MAX_LATENCY_MS?: string
  AGENT_MIN_CONFIDENCE?: string
  AGENT_ROLLOUT?: string
  AGENT_INCLUDE_ROUTES?: string
  AGENT_EXCLUDE_ROUTES?: string
  PROGRESS_KV?: KVNamespaceLike
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseRouteRules(value: string | undefined): string[] {
  if (!value || !value.trim()) return []
  return value
    .split(',')
    .map(rule => rule.trim())
    .filter(Boolean)
}

function normalizePatch(value: unknown): AgentConfigPatch {
  if (!isRecord(value)) {
    throw new Error('Invalid agent config patch payload')
  }

  const patch: AgentConfigPatch = {}

  if ('enabled' in value) {
    if (typeof value.enabled !== 'boolean') throw new Error('enabled must be boolean')
    patch.enabled = value.enabled
  }
  if ('shadowMode' in value) {
    if (typeof value.shadowMode !== 'boolean') throw new Error('shadowMode must be boolean')
    patch.shadowMode = value.shadowMode
  }
  if ('allowAISelection' in value) {
    if (typeof value.allowAISelection !== 'boolean') throw new Error('allowAISelection must be boolean')
    patch.allowAISelection = value.allowAISelection
  }
  if ('aiMaxLatencyMs' in value) {
    if (typeof value.aiMaxLatencyMs !== 'number' || !Number.isFinite(value.aiMaxLatencyMs)) {
      throw new Error('aiMaxLatencyMs must be number')
    }
    patch.aiMaxLatencyMs = Math.max(100, Math.min(3000, value.aiMaxLatencyMs))
  }
  if ('minConfidence' in value) {
    if (typeof value.minConfidence !== 'number' || !Number.isFinite(value.minConfidence)) {
      throw new Error('minConfidence must be number')
    }
    patch.minConfidence = Math.max(0, Math.min(1, value.minConfidence))
  }
  if ('rolloutPercent' in value) {
    if (typeof value.rolloutPercent !== 'number' || !Number.isFinite(value.rolloutPercent)) {
      throw new Error('rolloutPercent must be number')
    }
    patch.rolloutPercent = Math.max(0, Math.min(100, value.rolloutPercent))
  }
  if ('includeRoutes' in value) {
    if (!Array.isArray(value.includeRoutes) || !value.includeRoutes.every(v => typeof v === 'string')) {
      throw new Error('includeRoutes must be string[]')
    }
    patch.includeRoutes = value.includeRoutes.map(v => v.trim()).filter(Boolean)
  }
  if ('excludeRoutes' in value) {
    if (!Array.isArray(value.excludeRoutes) || !value.excludeRoutes.every(v => typeof v === 'string')) {
      throw new Error('excludeRoutes must be string[]')
    }
    patch.excludeRoutes = value.excludeRoutes.map(v => v.trim()).filter(Boolean)
  }

  return patch
}

function buildFromEnv(env: AgentEnvLike): AgentRuntimeConfig {
  return {
    enabled: parseBooleanFlag(env.AGENT_ENABLED, false),
    shadowMode: parseBooleanFlag(env.AGENT_SHADOW_MODE, false),
    allowAISelection: parseBooleanFlag(env.AGENT_AI_ENABLED, true),
    aiMaxLatencyMs: Math.max(100, Math.min(3000, parseNumber(env.AGENT_AI_MAX_LATENCY_MS, 300))),
    minConfidence: Math.max(0, Math.min(1, parseNumber(env.AGENT_MIN_CONFIDENCE, 0.65))),
    rolloutPercent: Math.max(0, Math.min(100, parseNumber(env.AGENT_ROLLOUT, 0))),
    includeRoutes: parseRouteRules(env.AGENT_INCLUDE_ROUTES),
    excludeRoutes: parseRouteRules(env.AGENT_EXCLUDE_ROUTES),
  }
}

function applyPatch(base: AgentRuntimeConfig, patch: AgentConfigPatch): AgentRuntimeConfig {
  return {
    enabled: patch.enabled ?? base.enabled,
    shadowMode: patch.shadowMode ?? base.shadowMode,
    allowAISelection: patch.allowAISelection ?? base.allowAISelection,
    aiMaxLatencyMs: patch.aiMaxLatencyMs ?? base.aiMaxLatencyMs,
    minConfidence: patch.minConfidence ?? base.minConfidence,
    rolloutPercent: patch.rolloutPercent ?? base.rolloutPercent,
    includeRoutes: patch.includeRoutes ?? base.includeRoutes,
    excludeRoutes: patch.excludeRoutes ?? base.excludeRoutes,
  }
}

async function readEnvelope(env: AgentEnvLike): Promise<AgentConfigOverrideEnvelope | null> {
  if (!env.PROGRESS_KV) return null
  const raw = await env.PROGRESS_KV.get(AGENT_CONFIG_OVERRIDE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AgentConfigOverrideEnvelope
    if (!parsed || !isRecord(parsed) || !isRecord(parsed.config)) return null
    return parsed
  } catch {
    return null
  }
}

function computeConfigChanges(
  before: AgentRuntimeConfig,
  after: AgentRuntimeConfig
): AgentConfigAuditRecord['changes'] {
  const fields: Array<keyof AgentRuntimeConfig> = [
    'enabled',
    'shadowMode',
    'allowAISelection',
    'aiMaxLatencyMs',
    'minConfidence',
    'rolloutPercent',
    'includeRoutes',
    'excludeRoutes',
  ]

  const changes: AgentConfigAuditRecord['changes'] = []
  for (const field of fields) {
    const beforeValue = before[field]
    const afterValue = after[field]
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes.push({
        field,
        before: beforeValue,
        after: afterValue,
      })
    }
  }
  return changes
}

function normalizeAuditRecord(input: unknown): AgentConfigAuditRecord | null {
  if (!isRecord(input)) return null
  if (typeof input.id !== 'string') return null
  if (input.action !== 'patch' && input.action !== 'reset') return null
  if (typeof input.timestamp !== 'string') return null

  // New compact format
  if (Array.isArray(input.changes)) {
    const changes = input.changes
      .filter(isRecord)
      .map(item => ({
        field: String(item.field) as keyof AgentRuntimeConfig,
        before: item.before,
        after: item.after,
      }))
      .filter(item =>
        [
          'enabled',
          'shadowMode',
          'allowAISelection',
          'aiMaxLatencyMs',
          'minConfidence',
          'rolloutPercent',
          'includeRoutes',
          'excludeRoutes',
        ].includes(item.field)
      )
    return {
      id: input.id,
      action: input.action,
      actorId: typeof input.actorId === 'string' ? input.actorId : undefined,
      timestamp: input.timestamp,
      patch: isRecord(input.patch) ? (input.patch as AgentConfigPatch) : undefined,
      changes,
    }
  }

  // Backward compatibility with legacy before/after format
  if (isRecord(input.before) && isRecord(input.after)) {
    const before = input.before as unknown as AgentRuntimeConfig
    const after = input.after as unknown as AgentRuntimeConfig
    return {
      id: input.id,
      action: input.action,
      actorId: typeof input.actorId === 'string' ? input.actorId : undefined,
      timestamp: input.timestamp,
      patch: isRecord(input.patch) ? (input.patch as AgentConfigPatch) : undefined,
      changes: computeConfigChanges(before, after),
    }
  }

  return null
}

export async function getEffectiveAgentConfig(env: AgentEnvLike): Promise<{
  config: AgentRuntimeConfig
  source: 'env' | 'env+override'
  overrideUpdatedAt?: string
  overrideUpdatedBy?: string
}> {
  const envConfig = buildFromEnv(env)
  const envelope = await readEnvelope(env)
  if (!envelope) {
    return { config: envConfig, source: 'env' }
  }
  const normalizedPatch = normalizePatch(envelope.config)
  return {
    config: applyPatch(envConfig, normalizedPatch),
    source: 'env+override',
    overrideUpdatedAt: envelope.updatedAt,
    overrideUpdatedBy: envelope.updatedBy,
  }
}

export async function saveAgentConfigPatch(
  env: AgentEnvLike,
  payload: unknown,
  actorId?: string
): Promise<{ config: AgentRuntimeConfig; updatedAt: string; updatedBy?: string }> {
  if (!env.PROGRESS_KV) {
    throw new Error('PROGRESS_KV binding is required for runtime agent config patch')
  }

  const patch = normalizePatch(payload)
  const before = await getEffectiveAgentConfig(env)
  const existing = await readEnvelope(env)
  const mergedPatch = {
    ...(existing?.config || {}),
    ...patch,
  }
  const updatedAt = new Date().toISOString()
  const envelope: AgentConfigOverrideEnvelope = {
    config: mergedPatch,
    updatedAt,
    updatedBy: actorId,
  }
  await env.PROGRESS_KV.put(AGENT_CONFIG_OVERRIDE_KEY, JSON.stringify(envelope))
  const effective = await getEffectiveAgentConfig(env)
  const changes = computeConfigChanges(before.config, effective.config)
  await appendAgentConfigAudit(env, {
    id: crypto.randomUUID(),
    action: 'patch',
    actorId,
    timestamp: updatedAt,
    patch,
    changes,
  })
  return {
    config: effective.config,
    updatedAt,
    updatedBy: actorId,
  }
}

export async function clearAgentConfigOverride(env: AgentEnvLike): Promise<AgentRuntimeConfig> {
  if (!env.PROGRESS_KV) {
    throw new Error('PROGRESS_KV binding is required for runtime agent config override reset')
  }

  const before = await getEffectiveAgentConfig(env)
  await env.PROGRESS_KV.delete(AGENT_CONFIG_OVERRIDE_KEY)
  const effective = await getEffectiveAgentConfig(env)
  const changes = computeConfigChanges(before.config, effective.config)
  await appendAgentConfigAudit(env, {
    id: crypto.randomUUID(),
    action: 'reset',
    timestamp: new Date().toISOString(),
    changes,
  })
  return effective.config
}

async function appendAgentConfigAudit(env: AgentEnvLike, record: AgentConfigAuditRecord): Promise<void> {
  if (!env.PROGRESS_KV) return
  const existing = await listAgentConfigAudit(env, MAX_AUDIT_RECORDS)
  const next = [record, ...existing].slice(0, MAX_AUDIT_RECORDS)
  await env.PROGRESS_KV.put(AGENT_CONFIG_AUDIT_KEY, JSON.stringify(next))
}

export async function listAgentConfigAudit(
  env: AgentEnvLike,
  limit = 20
): Promise<AgentConfigAuditRecord[]> {
  if (!env.PROGRESS_KV) return []
  const raw = await env.PROGRESS_KV.get(AGENT_CONFIG_AUDIT_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(item => normalizeAuditRecord(item))
      .filter((item): item is AgentConfigAuditRecord => Boolean(item))
      .slice(0, Math.max(1, Math.min(100, limit)))
  } catch {
    return []
  }
}

export async function listAgentConfigAuditPage(
  env: AgentEnvLike,
  options?: {
    limit?: number
    cursor?: string | null
  }
): Promise<{
  records: AgentConfigAuditRecord[]
  nextCursor: string | null
}> {
  const limit = Math.max(1, Math.min(100, Number(options?.limit ?? 20)))
  const rawCursor = options?.cursor ?? null
  let offset = 0
  if (rawCursor) {
    const parsed = Number(rawCursor)
    if (Number.isFinite(parsed) && parsed >= 0) {
      offset = Math.floor(parsed)
    }
  }

  const all = await listAgentConfigAudit(env, MAX_AUDIT_RECORDS)
  const records = all.slice(offset, offset + limit)
  const nextOffset = offset + records.length
  const nextCursor = nextOffset < all.length ? String(nextOffset) : null
  return {
    records,
    nextCursor,
  }
}
