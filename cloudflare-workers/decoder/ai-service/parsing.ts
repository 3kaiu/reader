import type { AIEntityResult, ParsedAIResult } from './types.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAIEntityResult(value: unknown): value is AIEntityResult {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.original === 'string' &&
    typeof value.real === 'string' &&
    typeof value.type === 'string' &&
    typeof value.confidence === 'number' &&
    value.confidence >= 0.1
  )
}

export function getTotalTokens(value: unknown): number | undefined {
  if (!isRecord(value) || !isRecord(value.usage)) {
    return undefined
  }

  return typeof value.usage.total_tokens === 'number' ? value.usage.total_tokens : undefined
}

export function getGroqMessageContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return null
  }

  const [firstChoice] = value.choices
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null
  }

  return typeof firstChoice.message.content === 'string' ? firstChoice.message.content : null
}

export function getHuggingFacePayload(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value
  }

  const [firstItem] = value
  if (!isRecord(firstItem) || typeof firstItem.generated_text !== 'string') {
    return value
  }

  return firstItem.generated_text
}

export function parseAIResponse(response: unknown): ParsedAIResult | null {
  if (!response) {
    return null
  }

  try {
    const text = typeof response === 'string' ? response : JSON.stringify(response)
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      return null
    }

    const parsed: unknown = JSON.parse(jsonMatch[0])
    if (!isRecord(parsed) || !Array.isArray(parsed.entities)) {
      return null
    }

    return {
      entities: parsed.entities.filter(isAIEntityResult),
    }
  } catch {
    return null
  }
}
