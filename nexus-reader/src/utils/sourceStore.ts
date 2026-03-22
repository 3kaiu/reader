import type { BookSource } from '@/types/source'
import { toPrettyJson } from '@/utils/json'

export type SourceDefinition = Partial<BookSource> & Record<string, unknown>

export type SourceListEntry = BookSource & {
  url: string
  enabled: boolean
}

export function normalizeSource(source: BookSource): SourceListEntry {
  return {
    ...source,
    url: source.url || '',
    enabled: source.enabled !== false,
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
