import type { BookSource, SourceLicenseStatus } from '@/types/source'
import { toPrettyJson } from '@/utils/json'

export type SourceDefinition = Partial<BookSource> & Record<string, unknown>

export type SourceListEntry = BookSource & {
  url: string
  enabled: boolean
  publicAccessEnabled: boolean
}

const LICENSE_PRIORITY: Record<SourceLicenseStatus, number> = {
  licensed: 4,
  public_domain: 4,
  unknown: 2,
  restricted: 1,
  blocked: 0,
}

export function getSourceBusinessPriority(source: Partial<BookSource>): number {
  const enabled = source.enabled !== false
  const publicAccessEnabled = source.publicAccessEnabled === true
  const licenseStatus = source.policy?.licenseStatus ?? 'unknown'
  const healthScore = source.health?.score ?? 0.5
  const avgLatencyMs = source.health?.avgLatencyMs ?? 0
  const successCount = source.health?.successCount ?? 0
  const failureCount = source.health?.failureCount ?? 0

  let score = 0

  score += enabled ? 400 : -200
  score += publicAccessEnabled ? 500 : 0
  score += LICENSE_PRIORITY[licenseStatus] * 40
  score += Math.round(healthScore * 100)
  score += Math.min(successCount, 20)
  score -= Math.min(failureCount * 5, 60)

  if (avgLatencyMs > 0) {
    score += Math.max(0, 30 - Math.round(avgLatencyMs / 200))
  }

  return score
}

export function compareSourcesByBusinessPriority(
  left: Partial<BookSource>,
  right: Partial<BookSource>,
): number {
  const priorityDiff =
    getSourceBusinessPriority(right) - getSourceBusinessPriority(left)

  if (priorityDiff !== 0) {
    return priorityDiff
  }

  return (left.name || '').localeCompare(right.name || '', 'zh-CN')
}

export function sortSourcesByBusinessPriority<T extends BookSource>(sources: T[]): T[] {
  return [...sources].sort(compareSourcesByBusinessPriority)
}

export function normalizeSource(source: BookSource): SourceListEntry {
  return {
    ...source,
    url: source.url || '',
    enabled: source.enabled !== false,
    publicAccessEnabled: source.publicAccessEnabled === true,
  }
}

export function normalizeSourceSearchKeyword(keyword: string): string {
  return keyword.trim().toLowerCase()
}

export function buildSourceGroups(
  sources: Array<Pick<BookSource, 'bookSourceGroup'>>
): Array<[string, number]> {
  const groupMap: Record<string, number> = { 全部: sources.length }

  sources.forEach(source => {
    const groupName = source.bookSourceGroup?.trim() || '未分组'
    groupMap[groupName] = (groupMap[groupName] || 0) + 1
  })

  return Object.entries(groupMap).sort((left, right) => {
    if (left[0] === '全部') return -1
    if (right[0] === '全部') return 1
    if (left[0] === '未分组') return -1
    if (right[0] === '未分组') return 1
    return right[1] - left[1]
  })
}

export function filterSourcesByKeyword<T extends Pick<BookSource, 'name' | 'url'>>(
  sources: T[],
  keyword = ''
): T[] {
  const query = normalizeSourceSearchKeyword(keyword)
  if (!query) {
    return sources
  }

  return sources.filter(
    source =>
      source.name.toLowerCase().includes(query) ||
      (source.url || '').toLowerCase().includes(query)
  )
}

export function filterSourcesByGroup<
  T extends Pick<BookSource, 'bookSourceGroup'>
>(sources: T[], groupName: string): T[] {
  if (!groupName || groupName === '全部') {
    return sources
  }

  return sources.filter(source => {
    const sourceGroup = source.bookSourceGroup?.trim() || '未分组'
    return sourceGroup === groupName
  })
}

export function toSourceDetailText(source: BookSource): string {
  return toPrettyJson(source)
}

export function toImportedSourceText(sources: SourceDefinition[]): string {
  return toPrettyJson(sources.length === 1 ? sources[0] : sources)
}
