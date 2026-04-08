const EDGE_ONLY_RULES = [
  "/api/analytics",
  "/api/agent",
  "/api/preferences",
  "/api/content/upload",
  "/api/backup",
  "/api/metrics/client",
  "/api/source/flow-assist",
  "/api/source/flow-assist/feedback",
  "/api/source/flow-assist/stats",
  "/api/source/flow-assist/profile",
  "/progress/",
  "/decode/",
  "/auth/",
]

const DIRECT_RULES = [
  "/api/search",
  "/api/sources",
  "/api/source-packages",
  "/api/source-builder",
  "/api/engine",
  "/api/fetch",
  "/api/book",
  "/api/chapters",
  "/api/content",
  "/api/batch/content",
  "/api/bookshelf",
  "/api/groups",
  "/api/replace_rules",
  "/api/discovery",
  "/api/ai/",
  "/ws/",
]

function normalizePath(path: string): string {
  const rawPath = /^https?:\/\//i.test(path) ? new URL(path).pathname : path.split(/[?#]/)[0]
  const pathname = rawPath.startsWith("/") ? rawPath : `/${rawPath}`

  if (pathname === "/api" || pathname.startsWith("/api/")) return pathname
  if (pathname.startsWith("/ws/")) return pathname
  if (pathname.startsWith("/progress/")) return pathname
  if (pathname.startsWith("/decode/")) return pathname
  if (pathname.startsWith("/auth/")) return pathname

  return `/api${pathname}`
}

function routeMatches(pathname: string, pattern: string): boolean {
  if (pattern.endsWith("/")) return pathname.startsWith(pattern)
  return pathname === pattern || pathname.startsWith(`${pattern}/`)
}

function matchesAnyRule(pathname: string, rules: string[]): boolean {
  return rules.some((pattern) => routeMatches(pathname, pattern))
}

interface RoutePolicyDecision {
  edgeOnly: boolean
  supportsDirect: boolean
}

export function resolveRoutePolicy(path: string): RoutePolicyDecision {
  const normalizedPath = normalizePath(path)
  if (matchesAnyRule(normalizedPath, EDGE_ONLY_RULES)) {
    return {
      edgeOnly: true,
      supportsDirect: false,
    }
  }

  return {
    edgeOnly: false,
    supportsDirect: matchesAnyRule(normalizedPath, DIRECT_RULES),
  }
}
