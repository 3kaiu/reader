import type {
  BookState,
  BookType,
  ConfirmEntryResponse,
  DecodeRequest,
  DecodeResponse,
  DictionaryEntry,
  DictionaryLevel,
} from '@/types/decoder'

export type DecoderDictionaryQuery = {
  level?: DictionaryLevel | 'all'
  bookId?: string
  category?: BookType
}

export type DictionaryEntriesResponse = {
  entries: DictionaryEntry[]
}

export type UpdateDictionaryPayload = {
  entry: Partial<DictionaryEntry>
  level: DictionaryLevel
  bookId?: string
  promote?: boolean
}

export type UpdateDictionaryResponse = {
  success: boolean
  entry: DictionaryEntry
}

export type ImportDictionaryResponse = {
  success: boolean
  imported: number
  total: number
}

export type ConfirmEntryPayload = {
  entry: Partial<DictionaryEntry>
  bookId: string
  bookType?: BookType
}

export type DeleteDictionaryEntryParams = {
  level?: DictionaryLevel
  bookId?: string
  category?: BookType
}

export type DeleteDictionaryEntryResponse = {
  success: boolean
  deletedId: string
  level: DictionaryLevel
  message: string
}

export type BatchDeleteDictionaryEntriesPayload = {
  ids: string[]
  level?: DictionaryLevel
  bookId?: string
  category?: BookType
}

export type BatchDeleteDictionaryEntriesResponse = {
  success: boolean
  deleted: number
  failed: number
  details: {
    deletedIds: string[]
    failedIds: string[]
  }
}

export type UpdateBookStatePayload = {
  meta?: Partial<BookState['meta']>
  aliasChain?: {
    bookAlias: string
    realName?: string
    entityId?: string
  }
}

export type DecoderHealthResponse = {
  status: string
  service: string
  timestamp: string
}

export type {
  ConfirmEntryResponse,
  DecodeRequest,
  DecodeResponse,
}
