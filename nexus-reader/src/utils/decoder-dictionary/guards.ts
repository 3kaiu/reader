import type {
  BookType,
  DictionaryLevel,
  EntityCategory,
  EntrySource,
} from '@/types/decoder'

export function isDecoderEntityCategory(value: unknown): value is EntityCategory {
  return (
    value === 'person' ||
    value === 'company' ||
    value === 'place' ||
    value === 'event' ||
    value === 'organization'
  )
}

export function isDecoderDictionaryLevel(value: unknown): value is DictionaryLevel {
  return value === 'global' || value === 'category' || value === 'book'
}

export function isDecoderBookType(value: unknown): value is BookType {
  return (
    value === 'era' ||
    value === 'entertainment' ||
    value === 'urban' ||
    value === 'history' ||
    value === 'business'
  )
}

export function isDecoderEntrySource(value: unknown): value is EntrySource {
  return value === 'system' || value === 'user' || value === 'ai' || value === 'community'
}
