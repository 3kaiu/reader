import type {
  AIEntityResult,
  AIInferRequest,
} from '../ai-service/types.ts'
import { buildEntity, normalizeEntityCategory } from './helpers.ts'
import type {
  DecodeRuntimeRequest,
  MatchedRange,
} from './types.ts'
import type { DecodedEntity } from '../../shared/types.ts'

export function extractUnknownSegments(content: string, matchedRanges: MatchedRange[]): string[] {
  if (matchedRanges.length === 0) {
    const middle = Math.floor(content.length / 2)
    const segment = content.substring(Math.max(0, middle - 200), Math.min(content.length, middle + 200))
    return [segment]
  }

  const segments: string[] = []
  let lastEnd = 0

  for (const [start, end] of matchedRanges) {
    if (start - lastEnd > 50) {
      const segment = content.substring(lastEnd, start)
      if (segment.length > 20) {
        segments.push(segment)
      }
    }
    lastEnd = end
  }

  if (content.length - lastEnd > 50) {
    const segment = content.substring(lastEnd)
    if (segment.length > 20) {
      segments.push(segment)
    }
  }

  return segments.slice(0, 3)
}

export function extractPotentialKeywords(content: string): string[] {
  const words = content.split(/[^\u4e00-\u9fa5a-zA-Z]+/).filter(word =>
    word.length >= 2 && word.length <= 6 && /[\u4e00-\u9fa5]/.test(word)
  )

  const frequency = new Map<string, number>()
  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1)
  }

  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word)
}

export function buildAIInferRequest(
  request: DecodeRuntimeRequest,
  matchedRanges: MatchedRange[]
): AIInferRequest | null {
  const unknownSegments = extractUnknownSegments(request.content, matchedRanges)
  if (unknownSegments.length === 0) {
    return null
  }

  return {
    text: unknownSegments.join('\n'),
    context: {
      bookType: 'generic',
      bookId: request.bookId,
      chapterId: request.chapterId,
    },
    unknownTerms: extractPotentialKeywords(request.content),
    bookId: request.bookId,
    chapterId: request.chapterId,
  }
}

export function mapAIEntitiesToDecoded(entities: AIEntityResult[]): DecodedEntity[] {
  return entities.map(entity =>
    buildEntity(
      entity.original,
      -1,
      -1,
      entity.real,
      'ai',
      Math.min(80, entity.confidence * 100),
      normalizeEntityCategory(entity.type)
    )
  )
}
