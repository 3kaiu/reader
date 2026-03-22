import type { LocationQuery, RouteLocationNamedRaw } from 'vue-router'

export interface ReaderRouteTarget {
  sourceId: string
  bookUrl: string
}

type ReaderRouteInput = Partial<ReaderRouteTarget> | null | undefined
type ReaderRouteLike = {
  sourceId?: unknown
  bookUrl?: unknown
} | null | undefined

function normalizeReaderRouteValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  if (Array.isArray(value)) {
    return normalizeReaderRouteValue(value[0])
  }

  return null
}

export function resolveReaderRouteTarget(target: ReaderRouteLike): ReaderRouteTarget | null {
  if (!target) {
    return null
  }

  const sourceId = normalizeReaderRouteValue(target.sourceId)
  const bookUrl = normalizeReaderRouteValue(target.bookUrl)

  if (!sourceId || !bookUrl) {
    return null
  }

  return {
    sourceId,
    bookUrl,
  }
}

export function parseReaderRouteQuery(
  query: LocationQuery | Record<string, unknown>,
): ReaderRouteTarget | null {
  return resolveReaderRouteTarget({
    sourceId: query.source,
    bookUrl: query.url,
  })
}

export function buildReaderRouteQuery(target: ReaderRouteInput) {
  const resolvedTarget = resolveReaderRouteTarget(target)
  if (!resolvedTarget) {
    throw new Error('缺少阅读器路由参数')
  }

  return {
    url: resolvedTarget.bookUrl,
    source: resolvedTarget.sourceId,
  }
}

export function buildReaderRouteLocation(target: ReaderRouteInput): RouteLocationNamedRaw {
  return {
    name: 'reader',
    query: buildReaderRouteQuery(target),
  }
}

export function isSameReaderRouteTarget(
  left: ReaderRouteInput,
  right: ReaderRouteInput,
): boolean {
  const normalizedLeft = resolveReaderRouteTarget(left)
  const normalizedRight = resolveReaderRouteTarget(right)

  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      normalizedLeft.sourceId === normalizedRight.sourceId &&
      normalizedLeft.bookUrl === normalizedRight.bookUrl,
  )
}
