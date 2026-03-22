export interface AiMappingRule {
  id: string
  original: string
  target: string
  type: string
  confidence: number
  enabled: boolean
  createdAt: number
  usageCount?: number
}

export interface AiAnalysisHistory {
  id: string
  bookTitle: string
  chapterTitle: string
  mappings: AiMappingRule[]
  analyzedAt: number
}
