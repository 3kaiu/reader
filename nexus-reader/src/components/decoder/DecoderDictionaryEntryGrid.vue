<script setup lang="ts">
import { LoadingGrid } from '@/components/common'
import DecoderDictionaryEmptyState from '@/components/decoder/DecoderDictionaryEmptyState.vue'
import DecoderDictionaryEntryCard from '@/components/decoder/DecoderDictionaryEntryCard.vue'
import type { DictionaryEntry } from '@/types/decoder'

interface Props {
  loading: boolean
  entries: DictionaryEntry[]
  searchKeyword: string
  isManageMode: boolean
  selectedEntryIds: Set<string>
}

defineProps<Props>()

const emit = defineEmits<{
  edit: [entry?: DictionaryEntry]
  delete: [entry: DictionaryEntry]
  'toggle-select': [entry: DictionaryEntry]
  'clear-search': []
}>()
</script>

<template>
  <LoadingGrid v-if="loading" />

  <DecoderDictionaryEmptyState
    v-else-if="entries.length === 0"
    :search-keyword="searchKeyword"
    @edit="emit('edit')"
    @clear-search="emit('clear-search')"
  />

  <div
    v-else
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
  >
    <DecoderDictionaryEntryCard
      v-for="entry in entries"
      :key="entry.id"
      :entry="entry"
      :is-manage-mode="isManageMode"
      :selected="selectedEntryIds.has(entry.id)"
      @edit="emit('edit', $event)"
      @delete="emit('delete', $event)"
      @toggle-select="emit('toggle-select', $event)"
    />
  </div>
</template>
