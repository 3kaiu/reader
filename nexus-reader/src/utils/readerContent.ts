import type { DecodedEntity } from '@/types/decoder'

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function applyDecoderHighlight(
  html: string,
  entities: DecodedEntity[]
): string {
  if (!entities || entities.length === 0) {
    return html
  }

  if (typeof document === 'undefined') {
    return html
  }

  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = html
  const plainText = tempDiv.textContent || ''

  if (!plainText) {
    return html
  }

  const validEntities = entities
    .filter(entity => entity.bestMatch !== null)
    .sort((a, b) => b.position.start - a.position.start)

  let result = html
  for (const entity of validEntities) {
    const original = entity.original
    const confidence = entity.bestMatch!.confidence
    const colorClass =
      confidence >= 80
        ? 'decoder-high'
        : confidence >= 50
          ? 'decoder-medium'
          : 'decoder-low'

    const regex = new RegExp(
      `(?<![<\\w])${escapeRegex(original)}(?![\\w>])`,
      'g'
    )
    result = result.replace(regex, match => {
      return `<span class="decoder-entity ${colorClass}" data-entity-id="${entity.id}" title="${entity.bestMatch!.real} (${confidence}%)">${match}</span>`
    })
  }

  return result
}
