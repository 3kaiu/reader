/**
 * Shared decoder contracts used by both the frontend and Cloudflare Workers.
 */

export type EntityCategory = 'person' | 'company' | 'place' | 'event' | 'organization'

export type BookType = 'era' | 'entertainment' | 'urban' | 'history' | 'business'

export type DecodeSource = 'dictionary' | 'rule' | 'knowledge_graph' | 'ai'

export type DictionaryLevel = 'global' | 'category' | 'book'

export type EntrySource = 'system' | 'user' | 'ai' | 'community'

export interface Candidate {
  real: string
  confidence: number
  category: EntityCategory
  reasoning?: string
  evidence?: string[]
}

export interface DecodedEntity {
  id: string
  original: string
  position: { start: number; end: number }
  candidates: Candidate[]
  bestMatch: Candidate | null
  source: DecodeSource
}

export interface ChapterContext {
  timeContext: {
    era?: string
    specificDate?: string
    confidence: number
  }
  locationContext: {
    city?: string
    specificPlace?: string
    confidence: number
  }
  industryContext: string[]
  identifiedEntities: {
    entityId: string
    mentions: string[]
    lastMentionPosition: number
  }[]
}

export interface BookMeta {
  type: BookType
  era?: string
  tags?: string[]
}

export interface DictionaryEntry {
  id: string
  original: string
  real: string
  category: EntityCategory
  aliases?: string[]
  description?: string
  level: DictionaryLevel
  categoryTags?: BookType[]
  eraRange?: [number, number]
  bookId?: string
  confidence: number
  confirmCount: number
  source: EntrySource
  createdAt: number
  updatedAt: number
}

export interface EntryConfirmation {
  totalConfirmCount: number
  confirmedInBooks: number
  threshold: number
}

export interface DecodeRequest {
  bookId: string
  chapterId: string
  content: string
  bookMeta?: BookMeta
}

export interface DecodeResponse {
  chapterId: string
  entities: DecodedEntity[]
  context: ChapterContext
  cached: boolean
}
