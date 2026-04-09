import { computed } from 'vue'
import type { DecodedEntity } from '@/types/decoder'
import { applyDecoderHighlight } from '@/utils/readerContent'

export function useReaderContentView(options: {
  decoderEnabled?: boolean
  decoderEntities?: DecodedEntity[]
  onEntityClick: (entity: DecodedEntity, event: MouseEvent) => void
}) {
  const HIGHLIGHT_CACHE_MAX_ENTRIES = 80
  const highlightCache = new Map<string, string>()

  const entityMap = computed(() => {
    const entities = options.decoderEntities || []
    return new Map(entities.map(entity => [entity.id, entity]))
  })

  const entitySignature = computed(() => {
    const entities = options.decoderEntities || []
    if (!options.decoderEnabled || entities.length === 0) {
      return 'disabled'
    }

    return entities
      .map(entity =>
        `${entity.id}:${entity.original}:${entity.bestMatch?.real || ''}:${entity.position.start}:${entity.position.end}`,
      )
      .join('|')
  })

  const getCacheKey = (content: string) => `${entitySignature.value}::${content}`

  const setHighlightCache = (cacheKey: string, highlighted: string) => {
    if (highlightCache.has(cacheKey)) {
      highlightCache.delete(cacheKey)
    }
    highlightCache.set(cacheKey, highlighted)

    while (highlightCache.size > HIGHLIGHT_CACHE_MAX_ENTRIES) {
      const oldestKey = highlightCache.keys().next().value
      if (!oldestKey) {
        break
      }
      highlightCache.delete(oldestKey)
    }
  }

  function handleContentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    if (!target?.classList.contains('decoder-entity')) {
      return
    }

    const entityId = target.dataset.entityId
    if (!entityId) {
      return
    }

    const entity = entityMap.value.get(entityId)
    if (entity) {
      options.onEntityClick(entity, event)
    }
  }

  function getHighlightedContent(content: string | undefined): string {
    if (!content) {
      return ''
    }

    if (!options.decoderEnabled || !options.decoderEntities?.length) {
      return content
    }

    const cacheKey = getCacheKey(content)
    const cached = highlightCache.get(cacheKey)
    if (typeof cached === 'string') {
      return cached
    }

    const highlighted = applyDecoderHighlight(content, options.decoderEntities)
    setHighlightCache(cacheKey, highlighted)
    return highlighted
  }

  return {
    handleContentClick,
    getHighlightedContent,
  }
}
