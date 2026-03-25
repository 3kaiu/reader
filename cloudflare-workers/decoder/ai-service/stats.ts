import type { AIModel, AIServiceStats, ModelStats } from './types.ts'

export function trimCallTimestamps(
  callTimestamps: number[],
  now: number,
  maxTimestampsHistory: number
): number[] {
  const recentTimestamps = callTimestamps.filter(timestamp => now - timestamp < 60000)
  if (recentTimestamps.length > maxTimestampsHistory) {
    return recentTimestamps.slice(-maxTimestampsHistory)
  }

  return recentTimestamps
}

export function getPreferredModel(modelStats: Map<string, ModelStats>): AIModel {
  let bestModel: AIModel = 'workers-ai'
  let bestScore = 0

  for (const [model, stats] of modelStats) {
    if (stats.totalCalls < 5) {
      continue
    }

    const successRate = stats.successfulCalls / stats.totalCalls
    const score = successRate * 1000 / stats.avgResponseTime
    if (score > bestScore) {
      bestScore = score
      bestModel = model as AIModel
    }
  }

  return bestModel
}

export function updateTrackedModelStats(
  modelStats: Map<string, ModelStats>,
  model: string,
  responseTime: number,
  tokensUsed: number,
  success: boolean
): void {
  const stats = modelStats.get(model) || {
    totalCalls: 0,
    successfulCalls: 0,
    avgResponseTime: 0,
    avgTokens: 0,
    lastUsed: 0,
  }

  stats.totalCalls++
  if (success) {
    stats.successfulCalls++
  }

  const alpha = 0.1
  stats.avgResponseTime = stats.avgResponseTime * (1 - alpha) + responseTime * alpha
  stats.avgTokens = stats.avgTokens * (1 - alpha) + tokensUsed * alpha
  stats.lastUsed = Date.now()

  modelStats.set(model, stats)
}

export function cleanupOldModelStats(
  modelStats: Map<string, ModelStats>,
  maxModelStats: number
): {
  modelStats: Map<string, ModelStats>
  cleanedCount: number
} {
  if (modelStats.size <= maxModelStats) {
    return {
      modelStats,
      cleanedCount: 0,
    }
  }

  const entries = Array.from(modelStats.entries())
  entries.sort((a, b) => b[1].lastUsed - a[1].lastUsed)

  const keepCount = Math.floor(maxModelStats * 0.8)
  const trimmedStats = new Map<string, ModelStats>()

  for (let index = 0; index < Math.min(keepCount, entries.length); index++) {
    trimmedStats.set(entries[index][0], entries[index][1])
  }

  return {
    modelStats: trimmedStats,
    cleanedCount: modelStats.size - trimmedStats.size,
  }
}

export function buildAIServiceStats(
  callCount: number,
  callTimestamps: number[],
  modelStats: Map<string, ModelStats>,
  cacheStats: AIServiceStats['cacheStats'],
  maxCallsPerMinute: number
): AIServiceStats {
  const now = Date.now()
  const recentCalls = callTimestamps.filter(timestamp => now - timestamp < 60000).length
  const remaining = Math.max(0, maxCallsPerMinute - recentCalls)
  const modelStatsRecord: Record<string, ModelStats> = {}

  for (const [model, stats] of modelStats) {
    modelStatsRecord[model] = stats
  }

  return {
    totalCalls: callCount,
    modelStats: modelStatsRecord,
    cacheStats,
    rateLimitRemaining: remaining,
  }
}
