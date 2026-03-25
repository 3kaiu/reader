import type { SmartCache } from '../../shared/smart-cache.ts'
import type { JsonObject } from '../../shared/types.ts'

export interface AIInferContext extends JsonObject {
  bookType?: string
  bookId?: string
  chapterId?: string
}

export interface AIEntityResult {
  original: string
  real: string
  type: string
  confidence: number
  position?: { start: number; end: number }
  reason?: string
}

export interface AIInferRequest {
  text: string
  context: AIInferContext
  unknownTerms: string[]
  bookId?: string
  chapterId?: string
}

export interface AIResponse {
  entities: AIEntityResult[]
  processingTime: number
  modelUsed: string
  tokensUsed: number
}

export interface ModelStats {
  totalCalls: number
  successfulCalls: number
  avgResponseTime: number
  avgTokens: number
  lastUsed: number
}

export interface ParsedAIResult {
  entities: AIEntityResult[]
}

export interface AIServiceStats {
  totalCalls: number
  modelStats: Record<string, ModelStats>
  cacheStats: ReturnType<SmartCache['getStats']>
  rateLimitRemaining: number
}

export type AIModel = 'workers-ai' | 'groq' | 'huggingface'
