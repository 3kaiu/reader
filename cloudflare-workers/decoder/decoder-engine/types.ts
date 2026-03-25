import type {
  BookType,
  ChapterContext,
  DecodeResponse,
  DecodedEntity,
} from '../../shared/types.ts'

export interface PotentialTerm {
  term: string
  start: number
  end: number
}

export type MatchedRange = [number, number]

export interface DecodeRuntimeRequest {
  content: string
  bookId?: string
  chapterId?: string
  bookType?: BookType
}

export interface TermMatcher {
  hasMatch: (term: string) => boolean
}

export function createEmptyChapterContext(entities: DecodedEntity[]): ChapterContext {
  return {
    timeContext: { confidence: 0 },
    locationContext: { confidence: 0 },
    industryContext: [],
    identifiedEntities: entities.map(entity => ({
      entityId: entity.id,
      mentions: [entity.original],
      lastMentionPosition: entity.position.end,
    })),
  }
}

export function createDecodeResponse(
  chapterId: string | undefined,
  entities: DecodedEntity[]
): DecodeResponse {
  return {
    chapterId,
    entities,
    context: createEmptyChapterContext(entities),
    cached: false,
  }
}
