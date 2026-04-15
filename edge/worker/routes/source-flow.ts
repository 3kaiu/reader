import { verifyAuth } from '../../shared/auth.ts'
import { generateTypedCacheKey } from '../../shared/cache.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import { jsonError } from '../http.ts'
import { corsHeaders, getErrorMessage, isRecord } from './shared.ts'

type SourceFlowAssistRequest = {
  query: string
  sourceId?: string
  blockers?: string[]
  context?: string
}

type SourceFlowSuggestion = {
  id: string
  title: string
  detail: string
  actionCode:
    | 'run_validation_with_samples'
    | 'fix_rule_compile_errors'
    | 'repair_search_selectors_or_samples'
    | 'repair_book_title_author_selectors'
    | 'repair_toc_item_selector'
    | 'repair_content_selector_and_noise_rules'
  priority: number
}

type SourceFlowAssistPayload = {
  normalizedQuery: string
  suggestions: SourceFlowSuggestion[]
}

type SourceFlowAssistResponse = {
  success: boolean
  cached: boolean
  provider: 'workers-ai' | 'ai-gateway' | 'none'
  generatedAtMs: number
  normalizedQuery: string
  suggestions: SourceFlowSuggestion[]
}

type SourceFlowAssistFeedbackRequest = {
  runId?: string
  sourceId?: string
  query?: string
  normalizedQuery?: string
  provider?: string
  cached?: boolean
  planSize: number
  suggestionIds: string[]
  beforeScore: number
  afterScore: number
  accepted: boolean
  regression?: string
}

type SourceFlowLifecycleState =
  | 'new'
  | 'warming'
  | 'stable'
  | 'degraded'
  | 'quarantined'

type SourceFlowAssistProfile = {
  sourceId: string
  lifecycleState: SourceFlowLifecycleState
  preferredActions: SourceFlowSuggestion['actionCode'][]
  conservativeMode: boolean
  lastGoodRunId?: string | null
  recentFailureCodes: string[]
  updatedAt: string
}

type SourceSessionState = 'cold' | 'warm' | 'healthy' | 'degraded' | 'blocked'
type SourceSessionAcquireStrategy =
  | 'auto_browser_like'
  | 'auto_api_like'
  | 'manual_fallback'

type SourceSessionProfile = {
  sourceId: string
  sessionState: SourceSessionState
  acquireStrategy: SourceSessionAcquireStrategy
  sessionKey: string | null
  ttlSeconds: number
  failStreak: number
  cooldownUntil: string | null
  qualityScore: number
  challengeHits: number
  emptyContentHits: number
  successCount: number
  failureCount: number
  lastValidatedAt: string | null
  lastRecoveryAction: string | null
  recoveryCount: number
  recoveryLastAt: string | null
  fingerprint: string | null
  updatedAt: string
}

type SourceSessionAutoAcquireResponse = {
  success: boolean
  profile: SourceSessionProfile
  sessionKey: string
  degraded: boolean
  degradedReason?: string
  sessionQualityScore: number
}

type SourceSessionVerifyResponse = {
  success: boolean
  verified: boolean
  statusCode: number | null
  challengeDetected: boolean
  emptyContent: boolean
  degraded: boolean
  degradedReason?: string
  sessionQualityScore: number
  profile: SourceSessionProfile
}

type SourceFlowProfileAuditEntry = {
  id: number
  sourceId: string
  action: string
  lifecycleState?: string
  conservativeMode?: boolean
  note?: string
  updatedBy?: string | null
  createdAt: string
}

type SourceFlowAssistFeedbackStatsResponse = {
  success: boolean
  windowDays: number
  sourceId?: string
  total: number
  accepted: number
  acceptRate: number
  avgBeforeScore: number
  avgAfterScore: number
  avgDeltaScore: number
  providers: Array<{
    provider: string
    count: number
    accepted: number
    acceptRate: number
  }>
  sourceLeaderboard: Array<{
    sourceId: string
    count: number
    accepted: number
    acceptRate: number
    avgDeltaScore: number
    regressionCount: number
  }>
  regressionTop: Array<{
    regression: string
    count: number
  }>
  recommendedActions: Array<{
    actionCode: SourceFlowSuggestion['actionCode']
    reason: string
    priority: number
  }>
  recentRegressions: string[]
}

const DEFAULT_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct'
const DEFAULT_CACHE_TTL = 3600
const MAX_QUERY_LEN = 200
const MAX_CONTEXT_LEN = 400
const ALLOWED_ACTIONS = new Set<SourceFlowSuggestion['actionCode']>([
  'run_validation_with_samples',
  'fix_rule_compile_errors',
  'repair_search_selectors_or_samples',
  'repair_book_title_author_selectors',
  'repair_toc_item_selector',
  'repair_content_selector_and_noise_rules',
])

function normalizeText(input: string, limit: number): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, limit)
}

function toActionCodeArray(value: unknown): SourceFlowSuggestion['actionCode'][] {
  if (!Array.isArray(value)) return []
  const actions: SourceFlowSuggestion['actionCode'][] = []
  for (const item of value) {
    const action = String(item || '').trim() as SourceFlowSuggestion['actionCode']
    if (ALLOWED_ACTIONS.has(action) && !actions.includes(action)) {
      actions.push(action)
    }
  }
  return actions.slice(0, 6)
}

function deriveRecommendedActions(options: {
  regressionTop: Array<{ regression: string; count: number }>
  sourceLeaderboard: Array<{ acceptRate: number; count: number; regressionCount: number }>
}): Array<{
  actionCode: SourceFlowSuggestion['actionCode']
  reason: string
  priority: number
}> {
  const buckets = new Map<
    SourceFlowSuggestion['actionCode'],
    { reason: string; weight: number }
  >()
  const bump = (
    actionCode: SourceFlowSuggestion['actionCode'],
    reason: string,
    weight: number
  ) => {
    const prev = buckets.get(actionCode)
    if (!prev || weight > prev.weight) {
      buckets.set(actionCode, { reason, weight })
    } else {
      prev.weight += Math.max(1, Math.round(weight * 0.3))
    }
  }

  for (const item of options.regressionTop.slice(0, 8)) {
    const text = item.regression
    const weight = Math.max(1, item.count)
    if (text.includes('搜索')) {
      bump('repair_search_selectors_or_samples', '搜索阶段回归高频', weight + 3)
    }
    if (text.includes('详情')) {
      bump('repair_book_title_author_selectors', '详情阶段回归高频', weight + 2)
    }
    if (text.includes('目录')) {
      bump('repair_toc_item_selector', '目录阶段回归高频', weight + 2)
    }
    if (text.includes('正文')) {
      bump('repair_content_selector_and_noise_rules', '正文阶段回归高频', weight + 2)
    }
    if (text.includes('未定位')) {
      bump('run_validation_with_samples', '存在未定位回归，需补样本再验证', weight + 1)
    }
  }

  const lowAcceptSources = options.sourceLeaderboard.filter(
    item => item.count >= 3 && item.acceptRate < 0.5
  ).length
  const heavyRegressionSources = options.sourceLeaderboard.filter(
    item => item.regressionCount >= 2
  ).length

  if (lowAcceptSources > 0) {
    bump(
      'run_validation_with_samples',
      '多个 source 命中率偏低，建议先补样本再细化规则',
      3 + lowAcceptSources
    )
  }
  if (heavyRegressionSources > 0) {
    bump(
      'fix_rule_compile_errors',
      '存在多源回归，建议先排除规则编译与字段映射错误',
      2 + heavyRegressionSources
    )
  }

  return [...buckets.entries()]
    .map(([actionCode, value]) => ({
      actionCode,
      reason: value.reason,
      priority: Math.max(1, 100 - value.weight),
    }))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
}

function stableHash(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function toSafeSuggestions(value: unknown): SourceFlowSuggestion[] {
  if (!Array.isArray(value)) return []
  const items: SourceFlowSuggestion[] = []
  for (const raw of value) {
    if (!isRecord(raw)) continue
    const actionCode = String(raw.actionCode || '').trim() as SourceFlowSuggestion['actionCode']
    if (!ALLOWED_ACTIONS.has(actionCode)) continue
    const title = String(raw.title || '').trim()
    const detail = String(raw.detail || '').trim()
    if (!title || !detail) continue
    const id = String(raw.id || `${actionCode}-${items.length + 1}`).trim()
    const priority = Number(raw.priority ?? 50)
    items.push({
      id: id || `${actionCode}-${items.length + 1}`,
      title: title.slice(0, 80),
      detail: detail.slice(0, 240),
      actionCode,
      priority: Number.isFinite(priority) ? Math.max(1, Math.min(100, priority)) : 50,
    })
  }
  return items
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
}

function parseAssistPayload(rawText: string): SourceFlowAssistPayload | null {
  try {
    const parsed: unknown = JSON.parse(rawText)
    if (!isRecord(parsed)) return null
    const normalizedQuery = normalizeText(String(parsed.normalizedQuery || ''), MAX_QUERY_LEN)
    const suggestions = toSafeSuggestions(parsed.suggestions)
    if (!normalizedQuery && suggestions.length === 0) return null
    return {
      normalizedQuery,
      suggestions,
    }
  } catch {
    return null
  }
}

function buildPrompt(input: SourceFlowAssistRequest): string {
  const blockers = (input.blockers || []).filter(Boolean).slice(0, 8)
  const normalizedQuery = normalizeText(input.query, MAX_QUERY_LEN)
  const context = normalizeText(input.context || '', MAX_CONTEXT_LEN)
  const sourceId = normalizeText(input.sourceId || '', 80)

  return [
    'You are assisting a Chinese reading app source-builder workflow.',
    'Output strict JSON only. No markdown.',
    'Schema:',
    '{"normalizedQuery":"string","suggestions":[{"id":"string","title":"string","detail":"string","actionCode":"run_validation_with_samples|fix_rule_compile_errors|repair_search_selectors_or_samples|repair_book_title_author_selectors|repair_toc_item_selector|repair_content_selector_and_noise_rules","priority":number}]}',
    `query="${normalizedQuery}"`,
    `sourceId="${sourceId || 'unknown'}"`,
    `blockers=${JSON.stringify(blockers)}`,
    `context="${context}"`,
    'Return up to 5 concise suggestions focused on: source packaging -> search -> detail -> toc -> content.',
  ].join('\n')
}

async function runViaWorkersAi(
  env: EnhancedWorkerEnv,
  prompt: string
): Promise<string | null> {
  if (!env.AI) return null
  const model = env.CF_WORKERS_AI_MODEL || DEFAULT_AI_MODEL
  const result = await env.AI.run(model, {
    prompt,
    temperature: 0.1,
    max_tokens: 700,
  })
  if (isRecord(result) && typeof result.response === 'string') {
    return result.response
  }
  if (typeof result === 'string') {
    return result
  }
  return null
}

async function runViaAiGateway(
  env: EnhancedWorkerEnv,
  prompt: string
): Promise<string | null> {
  if (!env.CF_AI_GATEWAY_BASE_URL) return null
  const model = env.CF_WORKERS_AI_MODEL || DEFAULT_AI_MODEL
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (env.CF_AI_GATEWAY_TOKEN) {
    headers.Authorization = `Bearer ${env.CF_AI_GATEWAY_TOKEN}`
  }
  const response = await fetch(env.CF_AI_GATEWAY_BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    }),
  })
  if (!response.ok) return null
  const payload: unknown = await response.json()
  if (!isRecord(payload)) return null
  const choices = payload.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0]
  if (!isRecord(first) || !isRecord(first.message)) return null
  const content = first.message.content
  return typeof content === 'string' ? content : null
}

async function logAssistEvent(
  env: EnhancedWorkerEnv,
  request: SourceFlowAssistRequest,
  provider: 'workers-ai' | 'ai-gateway' | 'none',
  cacheHit: boolean,
  latencyMs: number
): Promise<void> {
  try {
    await env.ANALYTICS_DB.prepare(`
      CREATE TABLE IF NOT EXISTS ai_source_flow_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT,
        query_len INTEGER NOT NULL,
        blockers_count INTEGER NOT NULL,
        provider TEXT NOT NULL,
        cache_hit INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).bind().run()

    await env.ANALYTICS_DB.prepare(`
      INSERT INTO ai_source_flow_events (
        source_id,
        query_len,
        blockers_count,
        provider,
        cache_hit,
        latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(
        request.sourceId || null,
        normalizeText(request.query || '', MAX_QUERY_LEN).length,
        Array.isArray(request.blockers) ? request.blockers.length : 0,
        provider,
        cacheHit ? 1 : 0,
        Math.max(0, Math.round(latencyMs))
      )
      .run()
  } catch {
    // keep request path non-blocking
  }
}

async function ensureFeedbackTable(env: EnhancedWorkerEnv): Promise<void> {
  await env.ANALYTICS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS ai_source_flow_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT,
      source_id TEXT,
      query TEXT,
      normalized_query TEXT,
      provider TEXT,
      cache_hit INTEGER NOT NULL,
      plan_size INTEGER NOT NULL,
      suggestion_ids TEXT NOT NULL,
      before_score REAL NOT NULL,
      after_score REAL NOT NULL,
      accepted INTEGER NOT NULL,
      regression TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).bind().run()

  try {
    await env.ANALYTICS_DB.prepare(`
      ALTER TABLE ai_source_flow_feedback ADD COLUMN run_id TEXT
    `).bind().run()
  } catch {
    // column may already exist
  }
}

async function ensureProfileTable(env: EnhancedWorkerEnv): Promise<void> {
  await env.ANALYTICS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS ai_source_flow_profiles (
      source_id TEXT PRIMARY KEY,
      lifecycle_state TEXT NOT NULL DEFAULT 'new',
      preferred_actions TEXT NOT NULL DEFAULT '[]',
      conservative_mode INTEGER NOT NULL DEFAULT 0,
      last_good_run_id TEXT,
      recent_failure_codes TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).bind().run()
}

async function ensureProfileAuditTable(env: EnhancedWorkerEnv): Promise<void> {
  await env.ANALYTICS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS ai_source_flow_profile_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      action TEXT NOT NULL,
      lifecycle_state TEXT,
      conservative_mode INTEGER,
      note TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).bind().run()
}

async function ensureSourceSessionProfileTable(env: EnhancedWorkerEnv): Promise<void> {
  await env.ANALYTICS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS ai_source_session_profiles (
      source_id TEXT PRIMARY KEY,
      session_state TEXT NOT NULL DEFAULT 'cold',
      acquire_strategy TEXT NOT NULL DEFAULT 'auto_browser_like',
      session_key TEXT,
      ttl_seconds INTEGER NOT NULL DEFAULT 1800,
      fail_streak INTEGER NOT NULL DEFAULT 0,
      cooldown_until TEXT,
      quality_score REAL NOT NULL DEFAULT 50,
      challenge_hits INTEGER NOT NULL DEFAULT 0,
      empty_content_hits INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_validated_at TEXT,
      last_recovery_action TEXT,
      recovery_count INTEGER NOT NULL DEFAULT 0,
      recovery_last_at TEXT,
      fingerprint TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).bind().run()
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function buildDefaultSourceSessionProfile(sourceId: string): SourceSessionProfile {
  return {
    sourceId,
    sessionState: 'cold',
    acquireStrategy: 'auto_browser_like',
    sessionKey: null,
    ttlSeconds: 1800,
    failStreak: 0,
    cooldownUntil: null,
    qualityScore: 50,
    challengeHits: 0,
    emptyContentHits: 0,
    successCount: 0,
    failureCount: 0,
    lastValidatedAt: null,
    lastRecoveryAction: null,
    recoveryCount: 0,
    recoveryLastAt: null,
    fingerprint: null,
    updatedAt: nowIso(),
  }
}

function mapSourceSessionProfileRow(
  sourceId: string,
  row: {
    source_id?: string
    session_state?: string
    acquire_strategy?: string
    session_key?: string | null
    ttl_seconds?: number
    fail_streak?: number
    cooldown_until?: string | null
    quality_score?: number
    challenge_hits?: number
    empty_content_hits?: number
    success_count?: number
    failure_count?: number
    last_validated_at?: string | null
    last_recovery_action?: string | null
    recovery_count?: number
    recovery_last_at?: string | null
    fingerprint?: string | null
    updated_at?: string
  } | null | undefined
): SourceSessionProfile {
  if (!row) {
    return buildDefaultSourceSessionProfile(sourceId)
  }
  return {
    sourceId: String(row.source_id || sourceId),
    sessionState: toSessionState(row.session_state),
    acquireStrategy: toAcquireStrategy(row.acquire_strategy),
    sessionKey: row.session_key || null,
    ttlSeconds: clampNumber(Math.round(Number(row.ttl_seconds || 1800)), 60, 43200),
    failStreak: Math.max(0, Math.round(Number(row.fail_streak || 0))),
    cooldownUntil: row.cooldown_until || null,
    qualityScore: clampNumber(Number(row.quality_score || 50), 0, 100),
    challengeHits: Math.max(0, Math.round(Number(row.challenge_hits || 0))),
    emptyContentHits: Math.max(0, Math.round(Number(row.empty_content_hits || 0))),
    successCount: Math.max(0, Math.round(Number(row.success_count || 0))),
    failureCount: Math.max(0, Math.round(Number(row.failure_count || 0))),
    lastValidatedAt: row.last_validated_at || null,
    lastRecoveryAction: row.last_recovery_action || null,
    recoveryCount: Math.max(0, Math.round(Number(row.recovery_count || 0))),
    recoveryLastAt: row.recovery_last_at || null,
    fingerprint: row.fingerprint || null,
    updatedAt: row.updated_at || nowIso(),
  }
}

async function getSourceSessionProfile(
  env: EnhancedWorkerEnv,
  sourceId: string
): Promise<SourceSessionProfile> {
  await ensureSourceSessionProfileTable(env)
  const row = await env.ANALYTICS_DB.prepare(`
    SELECT
      source_id,
      session_state,
      acquire_strategy,
      session_key,
      ttl_seconds,
      fail_streak,
      cooldown_until,
      quality_score,
      challenge_hits,
      empty_content_hits,
      success_count,
      failure_count,
      last_validated_at,
      last_recovery_action,
      recovery_count,
      recovery_last_at,
      fingerprint,
      updated_at
    FROM ai_source_session_profiles
    WHERE source_id = ?
    LIMIT 1
  `).bind(sourceId).first<{
    source_id?: string
    session_state?: string
    acquire_strategy?: string
    session_key?: string | null
    ttl_seconds?: number
    fail_streak?: number
    cooldown_until?: string | null
    quality_score?: number
    challenge_hits?: number
    empty_content_hits?: number
    success_count?: number
    failure_count?: number
    last_validated_at?: string | null
    last_recovery_action?: string | null
    recovery_count?: number
    recovery_last_at?: string | null
    fingerprint?: string | null
    updated_at?: string
  }>()

  return mapSourceSessionProfileRow(sourceId, row)
}

async function saveSourceSessionProfile(
  env: EnhancedWorkerEnv,
  profile: SourceSessionProfile
): Promise<void> {
  await ensureSourceSessionProfileTable(env)
  await env.ANALYTICS_DB.prepare(`
    INSERT INTO ai_source_session_profiles (
      source_id,
      session_state,
      acquire_strategy,
      session_key,
      ttl_seconds,
      fail_streak,
      cooldown_until,
      quality_score,
      challenge_hits,
      empty_content_hits,
      success_count,
      failure_count,
      last_validated_at,
      last_recovery_action,
      recovery_count,
      recovery_last_at,
      fingerprint,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(source_id) DO UPDATE SET
      session_state = excluded.session_state,
      acquire_strategy = excluded.acquire_strategy,
      session_key = excluded.session_key,
      ttl_seconds = excluded.ttl_seconds,
      fail_streak = excluded.fail_streak,
      cooldown_until = excluded.cooldown_until,
      quality_score = excluded.quality_score,
      challenge_hits = excluded.challenge_hits,
      empty_content_hits = excluded.empty_content_hits,
      success_count = excluded.success_count,
      failure_count = excluded.failure_count,
      last_validated_at = excluded.last_validated_at,
      last_recovery_action = excluded.last_recovery_action,
      recovery_count = excluded.recovery_count,
      recovery_last_at = excluded.recovery_last_at,
      fingerprint = excluded.fingerprint,
      updated_at = datetime('now')
  `).bind(
    profile.sourceId,
    profile.sessionState,
    profile.acquireStrategy,
    profile.sessionKey || null,
    clampNumber(Math.round(profile.ttlSeconds), 60, 43200),
    Math.max(0, Math.round(profile.failStreak)),
    profile.cooldownUntil || null,
    clampNumber(profile.qualityScore, 0, 100),
    Math.max(0, Math.round(profile.challengeHits)),
    Math.max(0, Math.round(profile.emptyContentHits)),
    Math.max(0, Math.round(profile.successCount)),
    Math.max(0, Math.round(profile.failureCount)),
    profile.lastValidatedAt || null,
    profile.lastRecoveryAction || null,
    Math.max(0, Math.round(profile.recoveryCount)),
    profile.recoveryLastAt || null,
    profile.fingerprint || null
  ).run()
}

async function writeProfileAudit(
  env: EnhancedWorkerEnv,
  payload: {
    sourceId: string
    action: string
    lifecycleState?: string
    conservativeMode?: boolean
    note?: string
    updatedBy?: string | null
  }
): Promise<void> {
  await ensureProfileAuditTable(env)
  await env.ANALYTICS_DB.prepare(`
    INSERT INTO ai_source_flow_profile_audit (
      source_id,
      action,
      lifecycle_state,
      conservative_mode,
      note,
      updated_by,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    payload.sourceId,
    payload.action,
    payload.lifecycleState || null,
    payload.conservativeMode == null ? null : payload.conservativeMode ? 1 : 0,
    payload.note || null,
    payload.updatedBy || null
  ).run()
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(item => String(item)).map(item => item.trim()).filter(Boolean)
  } catch {
    return []
  }
}

function toSessionState(value: unknown): SourceSessionState {
  const candidate = String(value || '').trim()
  if (
    candidate === 'cold' ||
    candidate === 'warm' ||
    candidate === 'healthy' ||
    candidate === 'degraded' ||
    candidate === 'blocked'
  ) {
    return candidate
  }
  return 'cold'
}

function toAcquireStrategy(value: unknown): SourceSessionAcquireStrategy {
  const candidate = String(value || '').trim()
  if (
    candidate === 'auto_browser_like' ||
    candidate === 'auto_api_like' ||
    candidate === 'manual_fallback'
  ) {
    return candidate
  }
  return 'auto_browser_like'
}

function nowIso(): string {
  return new Date().toISOString()
}

function computeChallengeDetected(status: number | null, bodyText: string): boolean {
  if (status != null && [403, 429, 503].includes(status)) {
    return true
  }
  const normalized = bodyText.toLowerCase()
  return (
    normalized.includes('captcha') ||
    normalized.includes('cloudflare') ||
    normalized.includes('attention required') ||
    normalized.includes('verify you are human')
  )
}

export async function handleSourceFlowAssist(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
  }

  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(request, 'BAD_REQUEST', 'Invalid JSON', 400)
  }
  if (!isRecord(body) || typeof body.query !== 'string') {
    return jsonError(request, 'BAD_REQUEST', 'Missing query', 400)
  }

  const assistRequest: SourceFlowAssistRequest = {
    query: body.query,
    sourceId: typeof body.sourceId === 'string' ? body.sourceId : undefined,
    blockers: Array.isArray(body.blockers)
      ? body.blockers.map(item => String(item)).filter(Boolean)
      : undefined,
    context: typeof body.context === 'string' ? body.context : undefined,
  }

  const startedAt = Date.now()
  const cacheKeyRaw = JSON.stringify({
    user: payload.id,
    sourceId: assistRequest.sourceId || '',
    query: normalizeText(assistRequest.query, MAX_QUERY_LEN),
    blockers: assistRequest.blockers || [],
    context: normalizeText(assistRequest.context || '', MAX_CONTEXT_LEN),
  })
  const cacheKey = generateTypedCacheKey('decode', `source_flow:${stableHash(cacheKeyRaw)}`)
  const cacheTtl = Math.max(60, Number(env.SOURCE_FLOW_ASSIST_CACHE_TTL_SEC || DEFAULT_CACHE_TTL))

  try {
    const cached = await env.AI_CACHE_KV.get<string>(cacheKey)
    if (cached) {
      const parsed = parseAssistPayload(cached)
      if (parsed) {
        const responseBody: SourceFlowAssistResponse = {
          success: true,
          cached: true,
          provider: 'none',
          generatedAtMs: Date.now(),
          normalizedQuery: parsed.normalizedQuery,
          suggestions: parsed.suggestions,
        }
        await logAssistEvent(env, assistRequest, 'none', true, Date.now() - startedAt)
        return new Response(JSON.stringify(responseBody), {
          headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
        })
      }
    }
  } catch {
    // ignore cache read failures
  }

  const prompt = buildPrompt(assistRequest)
  let provider: SourceFlowAssistResponse['provider'] = 'none'
  let rawText: string | null = null

  try {
    rawText = await runViaAiGateway(env, prompt)
    if (rawText) provider = 'ai-gateway'
  } catch {
    rawText = null
  }

  if (!rawText) {
    try {
      rawText = await runViaWorkersAi(env, prompt)
      if (rawText) provider = 'workers-ai'
    } catch {
      rawText = null
    }
  }

  let parsed = rawText ? parseAssistPayload(rawText) : null
  if (!parsed) {
    parsed = {
      normalizedQuery: normalizeText(assistRequest.query, MAX_QUERY_LEN),
      suggestions: [],
    }
  }

  try {
    await env.AI_CACHE_KV.put(cacheKey, JSON.stringify(parsed), { expirationTtl: cacheTtl })
  } catch {
    // ignore cache write failures
  }

  await logAssistEvent(env, assistRequest, provider, false, Date.now() - startedAt)

  const responseBody: SourceFlowAssistResponse = {
    success: true,
    cached: false,
    provider,
    generatedAtMs: Date.now(),
    normalizedQuery: parsed.normalizedQuery,
    suggestions: parsed.suggestions,
  }
  return new Response(JSON.stringify(responseBody), {
    headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
  })
}

export function handleSourceFlowAssistError(
  request: Request,
  error: unknown
): Response {
  return jsonError(
    request,
    'SOURCE_FLOW_ASSIST_FAILED',
    'Source flow assist failed',
    500,
    getErrorMessage(error)
  )
}

export async function handleSourceFlowAssistFeedback(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
  }

  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(request, 'BAD_REQUEST', 'Invalid JSON', 400)
  }
  if (!isRecord(body)) {
    return jsonError(request, 'BAD_REQUEST', 'Invalid payload', 400)
  }

  const feedback: SourceFlowAssistFeedbackRequest = {
    runId: typeof body.runId === 'string' ? body.runId : undefined,
    sourceId: typeof body.sourceId === 'string' ? body.sourceId : undefined,
    query: typeof body.query === 'string' ? body.query : undefined,
    normalizedQuery: typeof body.normalizedQuery === 'string' ? body.normalizedQuery : undefined,
    provider: typeof body.provider === 'string' ? body.provider : undefined,
    cached: Boolean(body.cached),
    planSize: Number(body.planSize ?? 0),
    suggestionIds: Array.isArray(body.suggestionIds)
      ? body.suggestionIds.map(item => String(item)).filter(Boolean).slice(0, 10)
      : [],
    beforeScore: Number(body.beforeScore ?? 0),
    afterScore: Number(body.afterScore ?? 0),
    accepted: Boolean(body.accepted),
    regression: typeof body.regression === 'string' ? body.regression : undefined,
  }

  if (!Number.isFinite(feedback.planSize) || feedback.planSize <= 0) {
    return jsonError(request, 'BAD_REQUEST', 'Invalid planSize', 400)
  }

  try {
    await ensureFeedbackTable(env)

    await env.ANALYTICS_DB.prepare(`
      INSERT INTO ai_source_flow_feedback (
        run_id,
        source_id,
        query,
        normalized_query,
        provider,
        cache_hit,
        plan_size,
        suggestion_ids,
        before_score,
        after_score,
        accepted,
        regression
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        feedback.runId || null,
        feedback.sourceId || null,
        feedback.query || null,
        feedback.normalizedQuery || null,
        feedback.provider || 'unknown',
        feedback.cached ? 1 : 0,
        Math.round(feedback.planSize),
        JSON.stringify(feedback.suggestionIds),
        feedback.beforeScore,
        feedback.afterScore,
        feedback.accepted ? 1 : 0,
        feedback.regression || null
      )
      .run()
  } catch (error) {
    return jsonError(
      request,
      'SOURCE_FLOW_FEEDBACK_FAILED',
      'Source flow feedback failed',
      500,
      getErrorMessage(error)
    )
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
  })
}

export async function handleSourceFlowAssistFeedbackStats(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
  }

  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  const url = new URL(request.url)
  const sourceId = normalizeText(url.searchParams.get('sourceId') || '', 80)
  const daysRaw = Number(url.searchParams.get('days') || 7)
  const windowDays = Number.isFinite(daysRaw) ? Math.max(1, Math.min(30, Math.round(daysRaw))) : 7

  try {
    await ensureFeedbackTable(env)

    const baseWhere = sourceId
      ? "created_at >= datetime('now', ?) AND source_id = ?"
      : "created_at >= datetime('now', ?)"
    const baseBindings = sourceId
      ? [`-${windowDays} days`, sourceId]
      : [`-${windowDays} days`]

    const summary = await env.ANALYTICS_DB.prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(accepted), 0) AS accepted,
        COALESCE(AVG(before_score), 0) AS avg_before_score,
        COALESCE(AVG(after_score), 0) AS avg_after_score,
        COALESCE(AVG(after_score - before_score), 0) AS avg_delta_score
      FROM ai_source_flow_feedback
      WHERE ${baseWhere}
    `).bind(...baseBindings).first<{
      total?: number
      accepted?: number
      avg_before_score?: number
      avg_after_score?: number
      avg_delta_score?: number
    }>()

    const providerRows = await env.ANALYTICS_DB.prepare(`
      SELECT
        provider,
        COUNT(*) AS count,
        COALESCE(SUM(accepted), 0) AS accepted
      FROM ai_source_flow_feedback
      WHERE ${baseWhere}
      GROUP BY provider
      ORDER BY count DESC
      LIMIT 6
    `).bind(...baseBindings).all<{
      provider?: string
      count?: number
      accepted?: number
    }>()

    const regressionRows = await env.ANALYTICS_DB.prepare(`
      SELECT regression
      FROM ai_source_flow_feedback
      WHERE ${baseWhere}
        AND accepted = 0
        AND regression IS NOT NULL
        AND LENGTH(TRIM(regression)) > 0
      ORDER BY id DESC
      LIMIT 5
    `).bind(...baseBindings).all<{ regression?: string }>()

    const sourceLeaderboardRows = await env.ANALYTICS_DB.prepare(`
      SELECT
        source_id,
        COUNT(*) AS count,
        COALESCE(SUM(accepted), 0) AS accepted,
        COALESCE(AVG(after_score - before_score), 0) AS avg_delta_score,
        COALESCE(SUM(CASE WHEN accepted = 0 THEN 1 ELSE 0 END), 0) AS regression_count
      FROM ai_source_flow_feedback
      WHERE created_at >= datetime('now', ?)
        AND source_id IS NOT NULL
        AND LENGTH(TRIM(source_id)) > 0
      GROUP BY source_id
      ORDER BY count DESC, avg_delta_score ASC
      LIMIT 8
    `).bind(`-${windowDays} days`).all<{
      source_id?: string
      count?: number
      accepted?: number
      avg_delta_score?: number
      regression_count?: number
    }>()

    const regressionTopRows = await env.ANALYTICS_DB.prepare(`
      SELECT
        regression,
        COUNT(*) AS count
      FROM ai_source_flow_feedback
      WHERE created_at >= datetime('now', ?)
        AND accepted = 0
        AND regression IS NOT NULL
        AND LENGTH(TRIM(regression)) > 0
      GROUP BY regression
      ORDER BY count DESC
      LIMIT 8
    `).bind(`-${windowDays} days`).all<{
      regression?: string
      count?: number
    }>()

    const total = Number(summary?.total || 0)
    const accepted = Number(summary?.accepted || 0)
    const sourceLeaderboard = (sourceLeaderboardRows.results || []).map(row => {
      const count = Number(row.count || 0)
      const acceptedCount = Number(row.accepted || 0)
      return {
        sourceId: String(row.source_id || '').trim() || 'unknown',
        count,
        accepted: acceptedCount,
        acceptRate: count > 0 ? acceptedCount / count : 0,
        avgDeltaScore: Number(row.avg_delta_score || 0),
        regressionCount: Number(row.regression_count || 0),
      }
    })
    const regressionTop = (regressionTopRows.results || []).map(row => ({
      regression: String(row.regression || '').trim(),
      count: Number(row.count || 0),
    }))

    const responseBody: SourceFlowAssistFeedbackStatsResponse = {
      success: true,
      windowDays,
      ...(sourceId ? { sourceId } : {}),
      total,
      accepted,
      acceptRate: total > 0 ? accepted / total : 0,
      avgBeforeScore: Number(summary?.avg_before_score || 0),
      avgAfterScore: Number(summary?.avg_after_score || 0),
      avgDeltaScore: Number(summary?.avg_delta_score || 0),
      providers: (providerRows.results || []).map(row => {
        const count = Number(row.count || 0)
        const acceptedCount = Number(row.accepted || 0)
        return {
          provider: row.provider || 'unknown',
          count,
          accepted: acceptedCount,
          acceptRate: count > 0 ? acceptedCount / count : 0,
        }
      }),
      sourceLeaderboard,
      regressionTop,
      recommendedActions: deriveRecommendedActions({
        regressionTop,
        sourceLeaderboard,
      }),
      recentRegressions: (regressionRows.results || [])
        .map(row => String(row.regression || '').trim())
        .filter(Boolean),
    }

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(
      request,
      'SOURCE_FLOW_FEEDBACK_STATS_FAILED',
      'Source flow feedback stats failed',
      500,
      getErrorMessage(error)
    )
  }
}

export async function handleSourceFlowAssistProfile(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)

  try {
    await ensureProfileTable(env)
  } catch (error) {
    return jsonError(
      request,
      'SOURCE_FLOW_PROFILE_FAILED',
      'Source flow profile table failed',
      500,
      getErrorMessage(error)
    )
  }

  if (request.method === 'GET') {
    const url = new URL(request.url)
    const sourceId = normalizeText(url.searchParams.get('sourceId') || '', 120)
    if (!sourceId) {
      return jsonError(request, 'BAD_REQUEST', 'Missing sourceId', 400)
    }

    try {
      const row = await env.ANALYTICS_DB.prepare(`
        SELECT
          source_id,
          lifecycle_state,
          preferred_actions,
          conservative_mode,
          last_good_run_id,
          recent_failure_codes,
          updated_at
        FROM ai_source_flow_profiles
        WHERE source_id = ?
        LIMIT 1
      `).bind(sourceId).first<{
        source_id?: string
        lifecycle_state?: string
        preferred_actions?: string
        conservative_mode?: number
        last_good_run_id?: string | null
        recent_failure_codes?: string
        updated_at?: string
      }>()

      const lifecycle = String(row?.lifecycle_state || 'new') as SourceFlowLifecycleState
      const profile: SourceFlowAssistProfile = {
        sourceId,
        lifecycleState: lifecycle,
        preferredActions: toActionCodeArray(parseJsonArray(row?.preferred_actions)),
        conservativeMode: Number(row?.conservative_mode || 0) > 0,
        lastGoodRunId: row?.last_good_run_id || null,
        recentFailureCodes: parseJsonArray(row?.recent_failure_codes).slice(0, 8),
        updatedAt: row?.updated_at || new Date().toISOString(),
      }
      return new Response(JSON.stringify({ success: true, profile }), {
        headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return jsonError(
        request,
        'SOURCE_FLOW_PROFILE_FAILED',
        'Source flow profile failed',
        500,
        getErrorMessage(error)
      )
    }
  }

  if (request.method === 'POST') {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonError(request, 'BAD_REQUEST', 'Invalid JSON', 400)
    }
    if (!isRecord(body)) {
      return jsonError(request, 'BAD_REQUEST', 'Invalid payload', 400)
    }

    const sourceId = normalizeText(typeof body.sourceId === 'string' ? body.sourceId : '', 120)
    if (!sourceId) {
      return jsonError(request, 'BAD_REQUEST', 'Missing sourceId', 400)
    }
    const lifecycleCandidate = String(body.lifecycleState || 'new').trim()
    const lifecycleState = (
      ['new', 'warming', 'stable', 'degraded', 'quarantined'].includes(lifecycleCandidate)
        ? lifecycleCandidate
        : 'new'
    ) as SourceFlowLifecycleState
    const preferredActions = toActionCodeArray(body.preferredActions)
    const recentFailureCodes = Array.isArray(body.recentFailureCodes)
      ? body.recentFailureCodes.map(item => String(item)).map(item => item.trim()).filter(Boolean).slice(0, 8)
      : []
    const conservativeMode = Boolean(body.conservativeMode)
    const lastGoodRunId = typeof body.lastGoodRunId === 'string' ? body.lastGoodRunId.trim() : null

    try {
      await env.ANALYTICS_DB.prepare(`
        INSERT INTO ai_source_flow_profiles (
          source_id,
          lifecycle_state,
          preferred_actions,
          conservative_mode,
          last_good_run_id,
          recent_failure_codes,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(source_id) DO UPDATE SET
          lifecycle_state = excluded.lifecycle_state,
          preferred_actions = excluded.preferred_actions,
          conservative_mode = excluded.conservative_mode,
          last_good_run_id = excluded.last_good_run_id,
          recent_failure_codes = excluded.recent_failure_codes,
          updated_at = datetime('now')
      `).bind(
        sourceId,
        lifecycleState,
        JSON.stringify(preferredActions),
        conservativeMode ? 1 : 0,
        lastGoodRunId || null,
        JSON.stringify(recentFailureCodes)
      ).run()
      await writeProfileAudit(env, {
        sourceId,
        action: 'save',
        lifecycleState,
        conservativeMode,
        note: `preferredActions=${preferredActions.length};recentFailures=${recentFailureCodes.length}`,
        updatedBy: String((payload as { sub?: string }).sub || ''),
      })
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return jsonError(
        request,
        'SOURCE_FLOW_PROFILE_FAILED',
        'Source flow profile save failed',
        500,
        getErrorMessage(error)
      )
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
}

export async function handleSourceFlowAssistProfileReset(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
  }

  try {
    await ensureProfileTable(env)
  } catch (error) {
    return jsonError(
      request,
      'SOURCE_FLOW_PROFILE_RESET_FAILED',
      'Source flow profile table failed',
      500,
      getErrorMessage(error)
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(request, 'BAD_REQUEST', 'Invalid JSON', 400)
  }
  if (!isRecord(body)) {
    return jsonError(request, 'BAD_REQUEST', 'Invalid payload', 400)
  }

  const sourceId = normalizeText(typeof body.sourceId === 'string' ? body.sourceId : '', 120)
  if (!sourceId) {
    return jsonError(request, 'BAD_REQUEST', 'Missing sourceId', 400)
  }
  const lifecycleState = (
    String(body.lifecycleState || 'warming').trim() === 'new' ? 'new' : 'warming'
  ) as SourceFlowLifecycleState
  const clearPreferredActions = Boolean(body.clearPreferredActions)

  try {
    await env.ANALYTICS_DB.prepare(`
      INSERT INTO ai_source_flow_profiles (
        source_id,
        lifecycle_state,
        preferred_actions,
        conservative_mode,
        last_good_run_id,
        recent_failure_codes,
        updated_at
      ) VALUES (?, ?, ?, 0, NULL, '[]', datetime('now'))
      ON CONFLICT(source_id) DO UPDATE SET
        lifecycle_state = excluded.lifecycle_state,
        preferred_actions = CASE
          WHEN ? = 1 THEN '[]'
          ELSE preferred_actions
        END,
        conservative_mode = 0,
        last_good_run_id = NULL,
        recent_failure_codes = '[]',
        updated_at = datetime('now')
    `).bind(
      sourceId,
      lifecycleState,
      clearPreferredActions ? '[]' : '[]',
      clearPreferredActions ? 1 : 0
    ).run()
    await writeProfileAudit(env, {
      sourceId,
      action: 'reset',
      lifecycleState,
      conservativeMode: false,
      note: `clearPreferredActions=${clearPreferredActions ? '1' : '0'}`,
      updatedBy: String((payload as { sub?: string }).sub || ''),
    })
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(
      request,
      'SOURCE_FLOW_PROFILE_RESET_FAILED',
      'Source flow profile reset failed',
      500,
      getErrorMessage(error)
    )
  }
}

export async function handleSourceFlowAssistProfileAudit(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  const payload = await verifyAuth(request, env)
  if (!payload) return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
  }

  try {
    await ensureProfileAuditTable(env)
  } catch (error) {
    return jsonError(
      request,
      'SOURCE_FLOW_PROFILE_AUDIT_FAILED',
      'Source flow profile audit table failed',
      500,
      getErrorMessage(error)
    )
  }

  const url = new URL(request.url)
  const sourceId = normalizeText(url.searchParams.get('sourceId') || '', 120)
  if (!sourceId) {
    return jsonError(request, 'BAD_REQUEST', 'Missing sourceId', 400)
  }
  const limitRaw = Number(url.searchParams.get('limit') || 20)
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 20

  try {
    const rows = await env.ANALYTICS_DB.prepare(`
      SELECT
        id,
        source_id,
        action,
        lifecycle_state,
        conservative_mode,
        note,
        updated_by,
        created_at
      FROM ai_source_flow_profile_audit
      WHERE source_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).bind(sourceId, limit).all<{
      id?: number
      source_id?: string
      action?: string
      lifecycle_state?: string | null
      conservative_mode?: number | null
      note?: string | null
      updated_by?: string | null
      created_at?: string
    }>()

    const entries: SourceFlowProfileAuditEntry[] = (rows.results || []).map(row => ({
      id: Number(row.id || 0),
      sourceId: String(row.source_id || sourceId),
      action: String(row.action || 'unknown'),
      lifecycleState: row.lifecycle_state || undefined,
      conservativeMode:
        row.conservative_mode == null ? undefined : Number(row.conservative_mode) > 0,
      note: row.note || undefined,
      updatedBy: row.updated_by || null,
      createdAt: row.created_at || new Date().toISOString(),
    }))

    return new Response(JSON.stringify({ success: true, entries }), {
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(
      request,
      'SOURCE_FLOW_PROFILE_AUDIT_FAILED',
      'Source flow profile audit failed',
      500,
      getErrorMessage(error)
    )
  }
}

function buildAutoSessionKey(sourceId: string): string {
  const stamp = Date.now().toString(36)
  return `auto-${stableHash(sourceId).slice(0, 8)}-${stamp}`
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function handleFetchSessionAutoAcquire(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  if (!(await verifyAuth(request, env))) {
    return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(request, 'BAD_REQUEST', 'Invalid JSON', 400)
  }
  if (!isRecord(body)) {
    return jsonError(request, 'BAD_REQUEST', 'Invalid payload', 400)
  }

  const sourceId = normalizeText(typeof body.sourceId === 'string' ? body.sourceId : '', 120)
  if (!sourceId) {
    return jsonError(request, 'BAD_REQUEST', 'Missing sourceId', 400)
  }

  try {
    const profile = await getSourceSessionProfile(env, sourceId)
    const ttlSeconds = clampNumber(
      Math.round(Number(body.ttlSeconds ?? profile.ttlSeconds ?? 1800)),
      60,
      43200
    )
    const acquireStrategy = toAcquireStrategy(body.acquireStrategy)
    const userAgent = normalizeText(typeof body.userAgent === 'string' ? body.userAgent : '', 160)
    const sessionKey = buildAutoSessionKey(sourceId)
    const fingerprintSeed = JSON.stringify({
      sourceId,
      acquireStrategy,
      userAgent,
      headerKeys: isRecord(body.headers) ? Object.keys(body.headers).sort().slice(0, 10) : [],
      cookieKeys: isRecord(body.cookies) ? Object.keys(body.cookies).sort().slice(0, 10) : [],
    })

    const nextProfile: SourceSessionProfile = {
      ...profile,
      sessionState: profile.sessionState === 'blocked' ? 'degraded' : 'warm',
      acquireStrategy,
      sessionKey,
      ttlSeconds,
      failStreak: 0,
      cooldownUntil: null,
      qualityScore: clampNumber(Math.max(profile.qualityScore, 58), 0, 100),
      lastValidatedAt: nowIso(),
      fingerprint: stableHash(fingerprintSeed),
      updatedAt: nowIso(),
    }
    await saveSourceSessionProfile(env, nextProfile)

    const responseBody: SourceSessionAutoAcquireResponse = {
      success: true,
      profile: nextProfile,
      sessionKey,
      degraded: false,
      sessionQualityScore: nextProfile.qualityScore,
    }
    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(
      request,
      'SESSION_AUTO_ACQUIRE_FAILED',
      'Session auto acquire failed',
      500,
      getErrorMessage(error)
    )
  }
}

export async function handleFetchSessionVerify(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  if (!(await verifyAuth(request, env))) {
    return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(request, 'BAD_REQUEST', 'Invalid JSON', 400)
  }
  if (!isRecord(body)) {
    return jsonError(request, 'BAD_REQUEST', 'Invalid payload', 400)
  }

  const sourceId = normalizeText(typeof body.sourceId === 'string' ? body.sourceId : '', 120)
  if (!sourceId) {
    return jsonError(request, 'BAD_REQUEST', 'Missing sourceId', 400)
  }

  try {
    const profile = await getSourceSessionProfile(env, sourceId)
    const probeUrl = normalizeText(typeof body.probeUrl === 'string' ? body.probeUrl : '', 512)
    const timeoutMs = clampNumber(Math.round(Number(body.timeoutMs ?? 12000)), 1500, 30000)
    const expectedMinBodyLength = clampNumber(
      Math.round(Number(body.expectedMinBodyLength ?? 200)),
      10,
      5000
    )
    const method = normalizeText(typeof body.method === 'string' ? body.method : 'GET', 8)
      .toUpperCase()
    let statusCode: number | null = null
    let responseBodyText = ''
    let verifyError: string | null = null

    if (probeUrl) {
      const headers = new Headers()
      if (isRecord(body.headers)) {
        for (const [key, value] of Object.entries(body.headers)) {
          if (!key) continue
          headers.set(key, String(value))
        }
      }
      if (profile.sessionKey) {
        headers.set('X-Fetch-Session-Key', profile.sessionKey)
      }
      try {
        const resp = await fetchWithTimeout(
          probeUrl,
          { method, headers },
          timeoutMs
        )
        statusCode = resp.status
        responseBodyText = await resp.text()
      } catch (error) {
        verifyError = getErrorMessage(error)
      }
    } else {
      responseBodyText = 'no_probe_url'
    }

    const challengeDetected = verifyError
      ? true
      : computeChallengeDetected(statusCode, responseBodyText)
    const emptyContent = !verifyError && responseBodyText.trim().length < expectedMinBodyLength
    const verified = !verifyError && (statusCode == null || (statusCode >= 200 && statusCode < 300)) && !challengeDetected && !emptyContent

    const nextProfile: SourceSessionProfile = {
      ...profile,
      lastValidatedAt: nowIso(),
      updatedAt: nowIso(),
    }

    if (verified) {
      nextProfile.sessionState = 'healthy'
      nextProfile.failStreak = 0
      nextProfile.cooldownUntil = null
      nextProfile.successCount += 1
      nextProfile.qualityScore = clampNumber(nextProfile.qualityScore + 8, 0, 100)
    } else {
      nextProfile.failureCount += 1
      nextProfile.failStreak += 1
      nextProfile.qualityScore = clampNumber(
        nextProfile.qualityScore - (challengeDetected ? 18 : emptyContent ? 12 : 8),
        0,
        100
      )
      if (challengeDetected) nextProfile.challengeHits += 1
      if (emptyContent) nextProfile.emptyContentHits += 1
      if (nextProfile.failStreak >= 3) {
        nextProfile.sessionState = 'blocked'
        nextProfile.cooldownUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      } else {
        nextProfile.sessionState = 'degraded'
      }
    }

    await saveSourceSessionProfile(env, nextProfile)

    const degraded = !verified
    const degradedReason = degraded
      ? verifyError
        ? `verify_error:${verifyError}`
        : challengeDetected
          ? 'challenge_detected'
          : emptyContent
            ? 'empty_content'
            : 'verify_failed'
      : undefined
    const response: SourceSessionVerifyResponse = {
      success: true,
      verified,
      statusCode,
      challengeDetected,
      emptyContent,
      degraded,
      ...(degradedReason ? { degradedReason } : {}),
      sessionQualityScore: nextProfile.qualityScore,
      profile: nextProfile,
    }
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(
      request,
      'SESSION_VERIFY_FAILED',
      'Session verify failed',
      500,
      getErrorMessage(error)
    )
  }
}

export async function handleSourceSessionProfile(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  if (!(await verifyAuth(request, env))) {
    return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
  }
  const url = new URL(request.url)
  const sourceId = normalizeText(url.searchParams.get('sourceId') || '', 120)
  if (!sourceId) {
    return jsonError(request, 'BAD_REQUEST', 'Missing sourceId', 400)
  }
  try {
    const profile = await getSourceSessionProfile(env, sourceId)
    return new Response(JSON.stringify({ success: true, profile }), {
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(
      request,
      'SOURCE_SESSION_PROFILE_FAILED',
      'Source session profile failed',
      500,
      getErrorMessage(error)
    )
  }
}

export async function handleSourceSessionProfileRecover(
  request: Request,
  env: EnhancedWorkerEnv
): Promise<Response> {
  if (!(await verifyAuth(request, env))) {
    return jsonError(request, 'UNAUTHORIZED', 'Unauthorized', 401)
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(request, 'BAD_REQUEST', 'Invalid JSON', 400)
  }
  if (!isRecord(body)) {
    return jsonError(request, 'BAD_REQUEST', 'Invalid payload', 400)
  }
  const sourceId = normalizeText(typeof body.sourceId === 'string' ? body.sourceId : '', 120)
  if (!sourceId) {
    return jsonError(request, 'BAD_REQUEST', 'Missing sourceId', 400)
  }
  const action = normalizeText(typeof body.action === 'string' ? body.action : 'refresh_session', 60)

  try {
    const profile = await getSourceSessionProfile(env, sourceId)
    const nextProfile: SourceSessionProfile = {
      ...profile,
      sessionState: profile.sessionState === 'blocked' ? 'degraded' : 'warm',
      failStreak: 0,
      cooldownUntil: null,
      qualityScore: clampNumber(profile.qualityScore + 5, 0, 100),
      recoveryCount: profile.recoveryCount + 1,
      recoveryLastAt: nowIso(),
      lastRecoveryAction: action,
      updatedAt: nowIso(),
    }
    await saveSourceSessionProfile(env, nextProfile)
    return new Response(JSON.stringify({ success: true, profile: nextProfile }), {
      headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return jsonError(
      request,
      'SOURCE_SESSION_RECOVER_FAILED',
      'Source session recover failed',
      500,
      getErrorMessage(error)
    )
  }
}
