import type { SkillCandidate, SkillDescriptor } from './types.ts'
import { buildAddonSkills } from './skills/addon.ts'
import { buildAnalyticsSkills } from './skills/analytics.ts'
import { buildAuthSyncSkills } from './skills/auth-sync.ts'
import { buildCoreReadingSkills } from './skills/core-reading.ts'

function matchesPath(pathname: string, pattern: string): boolean {
  if (pattern === '*') return true

  if (pattern.endsWith('*')) {
    return pathname.startsWith(pattern.slice(0, -1))
  }

  return pathname === pattern
}

function calcPatternScore(pathname: string, pattern: string): number {
  if (!matchesPath(pathname, pattern)) return -1

  if (pattern === '*') return 1
  if (pattern.endsWith('*')) return 100 + pattern.length
  return 200 + pattern.length
}

function methodAllowed(method: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(method)
}

export function collectSkillCandidates(
  request: Request,
  skills: SkillDescriptor[]
): SkillCandidate[] {
  const pathname = new URL(request.url).pathname
  const method = request.method.toUpperCase()
  const candidates: SkillCandidate[] = []

  for (const skill of skills) {
    if (!methodAllowed(method, skill.methods)) continue
    let score = -1
    for (const pattern of skill.patterns) {
      score = Math.max(score, calcPatternScore(pathname, pattern))
    }
    if (score > 0) {
      candidates.push({ skill, score })
    }
  }

  return candidates.sort((a, b) => b.score - a.score)
}

export function buildAgentSkills(): SkillDescriptor[] {
  return [
    ...buildAuthSyncSkills(),
    ...buildAnalyticsSkills(),
    ...buildAddonSkills(),
    ...buildCoreReadingSkills(),
  ]
}
