import { getSeverityForPriority } from './rules.ts'
import type { HealingEvent, HealingRule, HealingStatus } from './types.ts'

export function createHealingEvent(rule: HealingRule, startTime = Date.now()): HealingEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: startTime,
    ruleId: rule.id,
    ruleName: rule.name,
    severity: getSeverityForPriority(rule.priority),
    description: rule.description,
    action: `Executing: ${rule.name}`,
    success: false,
    duration: 0,
  }
}

export function completeHealingEvent(event: HealingEvent, duration: number): HealingEvent {
  return {
    ...event,
    success: true,
    duration,
    action: `Completed: ${event.ruleName}`,
  }
}

export function failHealingEvent(
  event: HealingEvent,
  duration: number,
  error: unknown
): HealingEvent {
  return {
    ...event,
    severity: 'error',
    action: `Failed: ${event.ruleName}`,
    success: false,
    duration,
    error: error instanceof Error ? error.message : 'Unknown error',
  }
}

export function appendHealingHistory(
  history: HealingEvent[],
  event: HealingEvent,
  maxHistorySize: number
): HealingEvent[] {
  const nextHistory = [...history, event]
  if (nextHistory.length > maxHistorySize) {
    return nextHistory.slice(-maxHistorySize)
  }

  return nextHistory
}

export function logHealingEvent(event: HealingEvent): void {
  const level = event.severity === 'critical'
    ? '🚨'
    : event.severity === 'error'
      ? '❌'
      : event.severity === 'warning'
        ? '⚠️'
        : 'ℹ️'

  console.log(`${level} [SELF-HEALING] ${event.ruleName}: ${event.description}`)
  if (event.error) {
    console.log(`   Error: ${event.error}`)
  }
}

export function buildHealthStatus(
  healingHistory: HealingEvent[],
  isActive: boolean,
  rulesCount: number
): HealingStatus {
  const recentEvents = healingHistory.slice(-10)
  const successful = healingHistory.filter(event => event.success)
  const failed = healingHistory.filter(event => !event.success)

  return {
    isActive,
    rulesCount,
    recentEvents,
    healingStats: {
      totalHealings: healingHistory.length,
      successfulHealings: successful.length,
      failedHealings: failed.length,
      avgHealingTime: successful.length > 0
        ? successful.reduce((sum, event) => sum + event.duration, 0) / successful.length
        : 0,
    },
  }
}
