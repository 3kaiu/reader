import type {
  BookType,
  DictionaryEntry,
  DictionaryLevel,
  EntityCategory,
  EntrySource,
} from '@/types/decoder'

export type DecoderTransferEntry = {
  id?: string
  original: string
  real: string
  category: EntityCategory
  aliases?: string[]
  description?: string
  level?: DictionaryLevel
  bookId?: string
  bookType?: BookType
  categoryTags?: BookType[]
  confidence?: number
  confirmCount?: number
  source?: EntrySource
  createdAt?: number
  updatedAt?: number
}

export type DecoderDictionaryDeleteRequest = {
  ids: string[]
  level?: DictionaryLevel
  bookId?: string
  category?: BookType
}

export type ParsedDecoderDictionaryImport = {
  success: boolean
  entries: DictionaryEntry[]
  totalCount: number
  invalidCount: number
  error?: string
}

export type DecoderEntryDraft = {
  original: string
  real: string
  category: EntityCategory
  description: string
  aliases: string
}
