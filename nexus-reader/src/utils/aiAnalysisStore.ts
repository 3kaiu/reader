import type {
  AiAnalysisHistory,
  AiMappingRule,
} from '@/types/ai-analysis'

export type AiMappingFilterType =
  | 'all'
  | 'person'
  | 'company'
  | 'department'
  | 'location'
  | 'other'

export function filterAiMappings(
  mappings: AiMappingRule[],
  filterType: AiMappingFilterType,
  searchKeyword: string
): AiMappingRule[] {
  let list = Array.isArray(mappings) ? mappings : []

  if (filterType !== 'all') {
    list = list.filter(mapping => mapping.type === filterType)
  }

  const query = searchKeyword.trim().toLowerCase()
  if (!query) {
    return list
  }

  return list.filter(
    mapping =>
      mapping.original.toLowerCase().includes(query) ||
      mapping.target.toLowerCase().includes(query)
  )
}

export function getAiMappingStats(mappings: AiMappingRule[]): {
  total: number
  enabled: number
} {
  return {
    total: mappings.length,
    enabled: mappings.filter(mapping => mapping.enabled).length,
  }
}

export function mergeLoadedHistory(
  current: AiAnalysisHistory[],
  incoming: AiAnalysisHistory[],
  limit?: number
): AiAnalysisHistory[] {
  if (typeof limit === 'number') {
    return incoming
  }

  return incoming.length > 0 ? incoming : current
}
