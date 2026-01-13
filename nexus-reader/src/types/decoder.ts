/**
 * 网文解密系统类型定义
 */

/** 实体类别 */
export type EntityCategory = 'person' | 'company' | 'place' | 'event' | 'organization'

/** 书籍类型 */
export type BookType = 'era' | 'entertainment' | 'urban' | 'history' | 'business'

/** 识别来源 */
export type DecodeSource = 'dictionary' | 'rule' | 'knowledge_graph' | 'ai'

/** 词典层级 */
export type DictionaryLevel = 'global' | 'category' | 'book'

/** 词条来源 */
export type EntrySource = 'system' | 'user' | 'ai' | 'community'

/** 候选结果 */
export interface Candidate {
  real: string
  confidence: number
  category: EntityCategory
  reasoning?: string
  evidence?: string[]
}

/** 解码后的实体 */
export interface DecodedEntity {
  id: string
  original: string
  position: { start: number; end: number }
  candidates: Candidate[]
  bestMatch: Candidate | null
  source: DecodeSource
}

/** 章节上下文 */
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

/** 书籍元数据 */
export interface BookMeta {
  type: BookType
  era?: string
  tags?: string[]
}

/** 词典条目 */
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

/** 解码请求 */
export interface DecodeRequest {
  bookId: string
  chapterId: string
  content: string
  bookMeta?: BookMeta
}

/** 解码响应 */
export interface DecodeResponse {
  chapterId: string
  entities: DecodedEntity[]
  context: ChapterContext
  cached: boolean
}

/** 书籍状态 */
export interface BookState {
  bookId: string
  meta: BookMeta
  aliasChains: {
    bookAlias: string
    realName?: string
    entityId?: string
  }[]
  stats: {
    totalDecoded: number
    totalEntities: number
    lastUpdated: number
  }
  createdAt: number
  updatedAt: number
}

/** 词条确认响应 */
export interface ConfirmEntryResponse {
  success: boolean
  entry: DictionaryEntry
  promoted: boolean
  confirmation: {
    totalConfirmCount: number
    confirmedInBooks: number
    threshold: number
  }
}
