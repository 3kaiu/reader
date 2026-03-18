export type UserJourney = 'search' | 'reading' | 'bookshelf' | 'sync' | 'system'

interface JourneyRule {
  pattern: string
  journey: UserJourney
}

const EDGE_ONLY_RULES: JourneyRule[] = [
  { pattern: '/api/analytics', journey: 'sync' },
  { pattern: '/api/preferences', journey: 'sync' },
  { pattern: '/api/content/upload', journey: 'sync' },
  { pattern: '/api/backup', journey: 'sync' },
  { pattern: '/api/metrics/client', journey: 'sync' },
  { pattern: '/progress/', journey: 'sync' },
  { pattern: '/decode/', journey: 'reading' },
  { pattern: '/auth/', journey: 'system' },
]

const DIRECT_RULES: JourneyRule[] = [
  { pattern: '/api/search', journey: 'search' },
  { pattern: '/api/sources', journey: 'search' },
  { pattern: '/api/book', journey: 'reading' },
  { pattern: '/api/chapters', journey: 'reading' },
  { pattern: '/api/content', journey: 'reading' },
  { pattern: '/api/batch/content', journey: 'reading' },
  { pattern: '/api/bookshelf', journey: 'bookshelf' },
  { pattern: '/api/groups', journey: 'bookshelf' },
  { pattern: '/api/replace_rules', journey: 'bookshelf' },
  { pattern: '/api/discovery', journey: 'bookshelf' },
  { pattern: '/api/ai/', journey: 'reading' },
  { pattern: '/api/voice/', journey: 'reading' },
  { pattern: '/ws/', journey: 'sync' },
]

function normalizePath(path: string): string {
  const rawPath = /^https?:\/\//i.test(path) ? new URL(path).pathname : path.split(/[?#]/)[0]
  const pathname = rawPath.startsWith('/') ? rawPath : `/${rawPath}`

  if (pathname === '/api' || pathname.startsWith('/api/')) return pathname
  if (pathname.startsWith('/ws/')) return pathname
  if (pathname.startsWith('/progress/')) return pathname
  if (pathname.startsWith('/decode/')) return pathname
  if (pathname.startsWith('/auth/')) return pathname

  return `/api${pathname}`
}

function routeMatches(pathname: string, pattern: string): boolean {
  if (pattern.endsWith('/')) return pathname.startsWith(pattern)
  return pathname === pattern || pathname.startsWith(`${pattern}/`)
}

function findFirstMatch(pathname: string, rules: JourneyRule[]): JourneyRule | undefined {
  return rules.find(rule => routeMatches(pathname, rule.pattern))
}

export interface RoutePolicyDecision {
  normalizedPath: string
  journey: UserJourney
  edgeOnly: boolean
  supportsDirect: boolean
}

export function resolveRoutePolicy(path: string): RoutePolicyDecision {
  const normalizedPath = normalizePath(path)
  const edgeRule = findFirstMatch(normalizedPath, EDGE_ONLY_RULES)
  if (edgeRule) {
    return {
      normalizedPath,
      journey: edgeRule.journey,
      edgeOnly: true,
      supportsDirect: false,
    }
  }

  const directRule = findFirstMatch(normalizedPath, DIRECT_RULES)
  return {
    normalizedPath,
    journey: directRule?.journey || 'system',
    edgeOnly: false,
    supportsDirect: Boolean(directRule),
  }
}
