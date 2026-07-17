export interface AliasMapping {
  id: string
  bookId: string
  alias: string
  canonical: string
  category: MappingCategory
  confidence: number
  source: MappingSource
  confirmed: boolean
  contextClues: string[]
  createdAt: string
  confirmedAt: string | null
  version: number
}

export interface CandidateMapping {
  alias: string
  canonical: string
  category: MappingCategory
  confidence: number
  contextClue: string | null
}

export interface PendingMapping {
  term: string
  suggestion: AliasMapping
  range: Range | null
}

export type MappingCategory =
  | 'person' | 'place' | 'event' | 'faction' | 'meme' | 'unknown'

export type MappingSource =
  | 'ai' | 'user' | 'community'

export type ConfidenceLevel =
  | 'high' | 'medium' | 'low'

export interface DecodeResponse {
  term: string
  explanation: string | null
  candidateMappings: CandidateMapping[]
  confidence: ConfidenceLevel
}

export interface AiConfig {
  enabled: boolean
  inferenceUrl: string
  model: string
  autoScan: boolean
}
