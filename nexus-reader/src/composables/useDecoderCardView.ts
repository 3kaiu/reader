import { computed, ref } from 'vue'
import type { DecodedEntity } from '@/types/decoder'

function getSourceName(source: string): string {
  const names: Record<string, string> = {
    dictionary: '词典',
    rule: '规则',
    knowledge_graph: '知识图谱',
    ai: 'AI推理',
  }
  return names[source] || source
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) {
    return 'text-green-500'
  }
  if (confidence >= 50) {
    return 'text-yellow-500'
  }
  return 'text-red-500'
}

function getConfidenceBg(confidence: number): string {
  if (confidence >= 80) {
    return 'bg-green-500/10'
  }
  if (confidence >= 50) {
    return 'bg-yellow-500/10'
  }
  return 'bg-red-500/10'
}

export function useDecoderCardView(options: {
  entity: DecodedEntity
  position?: { x: number; y: number } | null
  onConfirm: (entity: DecodedEntity) => void
  onCorrect: (entity: DecodedEntity, newReal: string) => void
}) {
  const showAllCandidates = ref(false)
  const isEditing = ref(false)
  const editValue = ref('')

  const displayCandidates = computed(() => {
    if (showAllCandidates.value) {
      return options.entity.candidates
    }
    return options.entity.candidates.slice(0, 1)
  })

  const hasMoreCandidates = computed(() => options.entity.candidates.length > 1)

  const cardStyle = computed(() => {
    if (!options.position) {
      return {}
    }

    return {
      position: 'fixed' as const,
      left: `${options.position.x}px`,
      top: `${options.position.y}px`,
      transform: 'translateX(-50%)',
      zIndex: 1000,
    }
  })

  function toggleCandidates() {
    showAllCandidates.value = !showAllCandidates.value
  }

  function startEdit() {
    editValue.value = options.entity.bestMatch?.real || ''
    isEditing.value = true
  }

  function submitEdit() {
    const nextValue = editValue.value.trim()
    if (nextValue) {
      options.onCorrect(options.entity, nextValue)
    }
    isEditing.value = false
  }

  function cancelEdit() {
    isEditing.value = false
    editValue.value = ''
  }

  function confirmResult() {
    options.onConfirm(options.entity)
  }

  return {
    showAllCandidates,
    isEditing,
    editValue,
    displayCandidates,
    hasMoreCandidates,
    cardStyle,
    getSourceName,
    getConfidenceColor,
    getConfidenceBg,
    toggleCandidates,
    startEdit,
    submitEdit,
    cancelEdit,
    confirmResult,
  }
}
