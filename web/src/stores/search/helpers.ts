import type {
  SearchError,
  SearchDisplayResult,
  SearchResult,
  SearchSourceOption,
} from '@/types/search'
import type { BookSource } from '@/types/source'
import { compareSourcesByBusinessPriority } from '@/stores/source/helpers'

// ─── 标识生成 ────────────────────────────────────────

export function getSearchResultIdentity(
  result: Pick<SearchResult, 'sourceId' | 'bookUrl'>
): string {
  return `${result.sourceId}::${result.bookUrl}`
}

export function getSearchAggregateKey(result: Pick<SearchResult, 'name' | 'author'>): string {
  return `${normalizeAggregateKeySegment(result.name)}||${normalizeAggregateKeySegment(result.author)}`
}

// ─── 源过滤 ──────────────────────────────────────────

export function buildAvailableSources(results: SearchResult[]): SearchSourceOption[] {
  const sources = new Map<string, SearchSourceOption>()

  results.forEach(book => {
    if (book.sourceId) {
      sources.set(book.sourceId, {
        id: book.sourceId,
        name: book.sourceName || book.sourceId,
      })
    }
  })

  return Array.from(sources.values()).sort((left, right) =>
    left.name.localeCompare(right.name, 'zh-CN')
  )
}

export function filterSearchResultsBySources(
  results: SearchResult[],
  selectedSources: Set<string>
): SearchResult[] {
  if (selectedSources.size === 0) {
    return results
  }

  return results.filter(book => selectedSources.has(book.sourceId || ''))
}

// ─── 历史管理 ──────────────────────────────────────────

export function appendSearchHistory(history: string[], query: string, limit: number): string[] {
  if (history.includes(query)) {
    return history
  }

  return [query, ...history.slice(0, limit - 1)]
}

export function toggleSelectedSource(selectedSources: Set<string>, source: string): Set<string> {
  const nextSources = new Set(selectedSources)

  if (nextSources.has(source)) {
    nextSources.delete(source)
  } else {
    nextSources.add(source)
  }

  return nextSources
}

// ─── 结果累加 ──────────────────────────────────────────

export function appendSearchResult(
  results: SearchResult[],
  nextResult: SearchResult
): SearchResult[] {
  const existingIndex = results.findIndex(
    book => book.sourceId === nextResult.sourceId && book.bookUrl === nextResult.bookUrl
  )

  if (existingIndex >= 0) {
    const next = [...results]
    next[existingIndex] = nextResult
    return next
  }

  return [...results, nextResult]
}

export function appendSearchError(errors: SearchError[], nextError: SearchError): SearchError[] {
  const existingIndex = errors.findIndex(error => error.sourceId === nextError.sourceId)

  if (existingIndex >= 0) {
    const next = [...errors]
    next[existingIndex] = nextError
    return next
  }

  return [...errors, nextError]
}

// ─── 排序 ──────────────────────────────────────────────

export type SearchResultComparator = (
  left: SearchResult,
  right: SearchResult
) => number

export type CompareDeps = {
  getPreferredSourceId: (book: Pick<SearchResult, 'name' | 'author'>) => string | undefined
  sourceById: ReadonlyMap<string, BookSource>
}

function normalizeAggregateKeySegment(value: string | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function createSearchResultComparator(deps: CompareDeps): SearchResultComparator {
  return function compare(left: SearchResult, right: SearchResult): number {
    const leftAggregateKey = getSearchAggregateKey(left)
    const rightAggregateKey = getSearchAggregateKey(right)

    // 同一书籍：优先选择偏好的源
    if (leftAggregateKey === rightAggregateKey) {
      const preferredSourceId = deps.getPreferredSourceId(left)
      const leftPreferred = preferredSourceId === left.sourceId
      const rightPreferred = preferredSourceId === right.sourceId

      if (leftPreferred !== rightPreferred) {
        return leftPreferred ? -1 : 1
      }
    }

    // 按包排名降序
    const leftPackageRank = left.searchExplain?.packageRank ?? 0
    const rightPackageRank = right.searchExplain?.packageRank ?? 0
    if (leftPackageRank !== rightPackageRank) {
      return rightPackageRank - leftPackageRank
    }

    // 按匹配分数降序
    const leftMatchScore = left.searchExplain?.matchScore ?? 0
    const rightMatchScore = right.searchExplain?.matchScore ?? 0
    if (leftMatchScore !== rightMatchScore) {
      return rightMatchScore - leftMatchScore
    }

    // 按书源优先级
    const leftSource = deps.sourceById.get(left.sourceId)
    const rightSource = deps.sourceById.get(right.sourceId)

    return compareSourcesByBusinessPriority(
      leftSource || { id: left.sourceId, name: left.sourceName, enabled: true },
      rightSource || { id: right.sourceId, name: right.sourceName, enabled: true }
    )
  }
}

// ─── 聚合 ──────────────────────────────────────────────

function mergeSearchResultDetails(current: SearchResult, incoming: SearchResult): SearchResult {
  return {
    ...current,
    intro: current.intro && current.intro.trim().length > 0 ? current.intro : incoming.intro,
    coverUrl: current.coverUrl || incoming.coverUrl,
    latestChapterTitle: current.latestChapterTitle || incoming.latestChapterTitle,
    latestChapter: current.latestChapter || incoming.latestChapter,
  }
}

function upsertSearchVariant(
  variants: SearchResult[],
  nextVariant: SearchResult,
  comparePrimary: SearchResultComparator
): SearchResult[] {
  const existingIndex = variants.findIndex(
    variant => variant.sourceId === nextVariant.sourceId && variant.bookUrl === nextVariant.bookUrl
  )

  const nextVariants =
    existingIndex >= 0
      ? variants.map((variant, index) =>
          index === existingIndex ? mergeSearchResultDetails(nextVariant, variant) : variant
        )
      : [...variants, nextVariant]

  return nextVariants.sort((left, right) => {
    const compare = comparePrimary(left, right)

    if (compare !== 0) {
      return compare
    }

    return left.sourceName.localeCompare(right.sourceName, 'zh-CN')
  })
}

export function aggregateSearchResults(
  results: SearchResult[],
  comparePrimary: SearchResultComparator
): SearchDisplayResult[] {
  const resultMap = new Map<string, SearchDisplayResult>()

  results.forEach(result => {
    const key = getSearchAggregateKey(result)
    const existing = resultMap.get(key)
    const sourceOption = {
      id: result.sourceId,
      name: result.sourceName || result.sourceId,
    }

    if (!existing) {
      resultMap.set(key, {
        ...result,
        sourceCount: 1,
        matchedSources: [sourceOption],
        sourceVariants: [result],
      })
      return
    }

    const sourceVariants = upsertSearchVariant(existing.sourceVariants, result, comparePrimary)
    const primaryResult = sourceVariants[0] || result
    const mergedPrimary = sourceVariants.reduce(
      (merged, variant) => mergeSearchResultDetails(merged, variant),
      primaryResult
    )
    const matchedSources = sourceVariants.map(variant => ({
      id: variant.sourceId,
      name: variant.sourceName || variant.sourceId,
    }))

    resultMap.set(key, {
      ...mergedPrimary,
      sourceCount: sourceVariants.length,
      matchedSources,
      sourceVariants,
    })
  })

  return Array.from(resultMap.values())
}

// ─── 错误装饰 ─────────────────────────────────────────

export function decorateSearchErrors(
  errors: SearchError[],
  sourceNameMap: ReadonlyMap<string, string>
) {
  return errors.map(error => ({
    ...error,
    sourceName: sourceNameMap.get(error.sourceId) || error.sourceId,
  }))
}