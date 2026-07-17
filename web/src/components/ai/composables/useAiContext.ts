import { ref } from 'vue'

export interface ChapterContextEntry {
  alias: string
  canonical: string
  category: string
  contextSnippet: string
}

export interface EventContextEntry {
  reference: string
  description: string | null
  category: string
  contextSnippet: string
}

/**
 * Sidebar context state for the current chapter.
 */
export function useAiContext() {
  const showPanel = ref(false)
  const aliases = ref<ChapterContextEntry[]>([])
  const events = ref<EventContextEntry[]>([])
  const summary = ref<string | null>(null)

  function clear() {
    aliases.value = []
    events.value = []
    summary.value = null
  }

  function setChapterData(data: {
    aliases: ChapterContextEntry[]
    events: EventContextEntry[]
    summary: string | null
  }) {
    aliases.value = data.aliases
    events.value = data.events
    summary.value = data.summary
  }

  function togglePanel() {
    showPanel.value = !showPanel.value
  }

  return {
    showPanel,
    aliases,
    events,
    summary,
    clear,
    setChapterData,
    togglePanel,
  }
}
