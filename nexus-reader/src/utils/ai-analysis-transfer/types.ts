import type { AiMappingRule } from '@/types/ai-analysis'

export type AiMappingTransferRule = Pick<
  AiMappingRule,
  'id' | 'original' | 'target' | 'type' | 'confidence' | 'enabled'
>

export type AiMappingDraft = {
  original: string
  target: string
  type: string
  confidence: number
  enabled: boolean
}

export type ParsedAiMappingImport = {
  success: boolean
  rules: AiMappingRule[]
  totalCount: number
  skippedCount: number
  error?: string
}
