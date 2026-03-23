/**
 * 网文解密系统类型定义
 */

import type { BookMeta, DictionaryEntry, EntryConfirmation } from '../../../contracts/decoder.ts'

export type {
  EntityCategory,
  BookType,
  DecodeSource,
  DictionaryLevel,
  EntrySource,
  Candidate,
  DecodedEntity,
  ChapterContext,
  BookMeta,
  DictionaryEntry,
  EntryConfirmation,
  DecodeRequest,
  DecodeResponse,
} from '../../../contracts/decoder.ts'

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
  confirmation: EntryConfirmation
}
