import type {
  BookType,
  DecodedEntity,
  DictionaryEntry,
  DictionaryLevel,
  EntityCategory,
} from '@/types/decoder'

export function sanitizeLevel(level?: DictionaryLevel): DictionaryLevel {
  if (level === 'global' || level === 'category' || level === 'book') {
    return level
  }
  return 'global'
}

export function sanitizeBookType(value?: string): BookType | undefined {
  if (
    value === 'era' ||
    value === 'entertainment' ||
    value === 'urban' ||
    value === 'history' ||
    value === 'business'
  ) {
    return value
  }
  return undefined
}

export function sanitizeEntityCategory(value?: string): EntityCategory {
  if (
    value === 'person' ||
    value === 'company' ||
    value === 'place' ||
    value === 'event' ||
    value === 'organization'
  ) {
    return value
  }
  return 'person'
}

export function buildDictionaryEntry(
  entity: Pick<DecodedEntity, 'id' | 'original' | 'bestMatch'>,
  overrideReal?: string,
): Partial<DictionaryEntry> {
  const bestMatch = entity.bestMatch ?? null
  return {
    id: entity.id,
    original: entity.original,
    real: overrideReal || bestMatch?.real || entity.original,
    category: sanitizeEntityCategory(bestMatch?.category),
    confidence: bestMatch?.confidence || 100,
    source: 'user',
  }
}
