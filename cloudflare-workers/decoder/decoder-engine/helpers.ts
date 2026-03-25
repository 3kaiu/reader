import type {
  DecodedEntity,
  EntityCategory,
} from '../../shared/types.ts'

export function hashContent(content: string): string {
  let hash = 0
  for (let index = 0; index < content.length; index++) {
    const char = content.charCodeAt(index)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }

  return Math.abs(hash).toString(36)
}

export function isPotentialTermStart(char: string): boolean {
  return /[\u4e00-\u9fa5a-zA-Z]/.test(char)
}

export function quickPreCheck(term: string): boolean {
  if (term.length < 2) {
    return false
  }

  if (/^\d+$/.test(term)) {
    return false
  }

  if (/^[a-zA-Z]+$/.test(term) && term.length > 6) {
    return false
  }

  return true
}

export function normalizeEntityCategory(category: string | undefined): EntityCategory {
  switch (category) {
    case 'person':
    case 'company':
    case 'place':
    case 'event':
    case 'organization':
      return category
    default:
      return 'person'
  }
}

export function buildEntity(
  original: string,
  start: number,
  end: number,
  real: string,
  source: 'dictionary' | 'knowledge_graph' | 'ai',
  confidence = 90,
  category: EntityCategory = 'person'
): DecodedEntity {
  return {
    id: crypto.randomUUID(),
    original,
    position: { start, end },
    candidates: [{ real, confidence, category }],
    bestMatch: { real, confidence, category },
    source,
  }
}
