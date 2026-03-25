import type {
  BookType,
  DecodedEntity,
  DictionaryEntry,
  DictionaryLevel,
} from '@/types/decoder'

export type DecoderActionErrorState = {
  value: string | null
}

export type DecoderBookMeta = {
  type?: BookType
  tags?: string[]
  era?: string
}

export type DecoderDictionaryQuery = {
  level?: DictionaryLevel | 'all'
  bookId?: string
  category?: string
}

export type DecoderDictionaryDeleteParams = {
  level?: DictionaryLevel
  bookId?: string
  category?: string
}

export type DecoderDictionaryBatchDeleteParams = {
  ids: string[]
  level?: DictionaryLevel
  bookId?: string
  category?: string
}

export type DecoderEntityInput = Pick<DecodedEntity, 'id' | 'original' | 'bestMatch'>

export type DecoderDictionaryEntryInput = Partial<DictionaryEntry>
