import { ref, computed } from 'vue'
import type { AliasMapping, PendingMapping, DecodeResponse } from './types'
import { $post } from '@/api/client'

/**
 * Core composable for AI Decoder interaction.
 *
 * Manages:
 * - In-flight decode requests
 * - Confirmation queue (pending user validation)
 * - Known mapping state for current book
 * - Visual overlay triggers
 */
export function useAiDecoder() {
  const enabled = ref(false)
  const pendingConfirmations = ref<PendingMapping[]>([])
  const knownMappings = ref<Map<string, AliasMapping>>(new Map())
  const currentSelection = ref<{ text: string; range: Range | null } | null>(null)
  const isLoading = ref(false)
  const lastResult = ref<DecodeResponse | null>(null)

  const pendingCount = computed(() => pendingConfirmations.value.length)

  function setEnabled(v: boolean) {
    enabled.value = v
  }

  async function decodeSelection(text: string, surrounding: string): Promise<DecodeResponse | null> {
    if (!enabled.value) return null

    isLoading.value = true

    try {
      const response = await $post<DecodeResponse>('/api/ai/decode', {
        selectedText: text,
        surroundingText: surrounding,
      })
      if (!response.isSuccess) return null
      const result = response.data

      lastResult.value = result

      // Auto-queue high-confidence single candidates for confirmation
      if (result.confidence === 'high' && result.candidateMappings.length === 1) {
        const cm = result.candidateMappings[0]
        const mapping: AliasMapping = {
          id: crypto.randomUUID(),
          bookId: '',
          alias: cm.alias,
          canonical: cm.canonical,
          category: cm.category,
          confidence: cm.confidence,
          source: 'ai',
          confirmed: false,
          contextClues: cm.contextClue ? [cm.contextClue] : [],
          createdAt: new Date().toISOString(),
          confirmedAt: null,
          version: 1,
        }
        pendingConfirmations.value.push({
          term: result.term,
          suggestion: mapping,
          range: currentSelection.value?.range ?? null,
        })
      }

      return result
    } finally {
      isLoading.value = false
    }
  }

  function confirmMapping(mapping: AliasMapping) {
    mapping.confirmed = true
    mapping.confirmedAt = new Date().toISOString()
    mapping.source = 'user'
    knownMappings.value.set(mapping.alias, mapping)

    // Remove from pending queue
    pendingConfirmations.value = pendingConfirmations.value.filter(
      (p) => p.suggestion.alias !== mapping.alias
    )

    // TODO V2: persist via PUT /api/ai/mapping
  }

  function rejectMapping(alias: string) {
    pendingConfirmations.value = pendingConfirmations.value.filter(
      (p) => p.suggestion.alias !== alias
    )
  }

  function getKnownMapping(alias: string): AliasMapping | undefined {
    return knownMappings.value.get(alias)
  }

  function isKnown(alias: string): boolean {
    return knownMappings.value.has(alias)
  }

  function loadMappings(mappings: AliasMapping[]) {
    for (const m of mappings) {
      knownMappings.value.set(m.alias, m)
    }
  }

  return {
    enabled,
    pendingConfirmations,
    knownMappings,
    currentSelection,
    isLoading,
    lastResult,
    pendingCount,
    setEnabled,
    decodeSelection,
    confirmMapping,
    rejectMapping,
    getKnownMapping,
    isKnown,
    loadMappings,
  }
}
