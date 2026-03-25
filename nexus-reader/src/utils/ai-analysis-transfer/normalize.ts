export function normalizeAiMappingText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeAiMappingConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.8
  }

  return Math.min(1, Math.max(0, value))
}

export function normalizeAiMappingType(value: unknown): string {
  const type = normalizeAiMappingText(value)
  return type || 'person'
}
