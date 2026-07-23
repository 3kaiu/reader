<script setup lang="ts">
/**
 * Popup shown when user selects text and AI returns a decode result.
 * Displays explanation + candidate mappings + confirmation option.
 */
import { ref, watch } from 'vue'
import type { DecodeResponse } from './composables/types'

const props = defineProps<{
  result: DecodeResponse | null
  loading: boolean
  position: { x: number; y: number } | null
}>()

const emit = defineEmits<{
  confirm: [mapping: { alias: string; canonical: string }]
  reject: [alias: string]
  close: []
}>()

const show = ref(false)

function categoryBadgeClass(category: string): string {
  switch (category) {
    case 'person':
      return 'bg-blue-100 text-blue-800'
    case 'place':
      return 'bg-green-100 text-green-800'
    case 'event':
      return 'bg-purple-100 text-purple-800'
    case 'faction':
      return 'bg-orange-100 text-orange-800'
    case 'meme':
      return 'bg-pink-100 text-pink-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

watch(() => props.result, (val) => {
  show.value = val !== null
})
</script>

<template>
  <div
    v-if="show && result"
    class="fixed z-50 w-80 rounded-lg border bg-popover p-3 shadow-lg text-sm"
    :style="{
      left: (position?.x ?? 0) + 'px',
      top: ((position?.y ?? 0) + 20) + 'px',
    }"
  >
    <div class="flex items-start justify-between gap-2">
      <span class="font-medium text-foreground">
        "{{ result.term }}"
      </span>
      <button
        class="text-muted-foreground hover:text-foreground shrink-0"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <p v-if="result.explanation" class="mt-1.5 text-muted-foreground">
      {{ result.explanation }}
    </p>

    <div v-if="result.candidateMappings.length > 0" class="mt-2 space-y-1.5">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        可能指向
      </p>
      <button
        v-for="cm in result.candidateMappings"
        :key="cm.alias + cm.canonical"
        class="w-full rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent"
        @click="emit('confirm', { alias: cm.alias, canonical: cm.canonical })"
      >
        <span class="font-medium">{{ cm.canonical }}</span>
        <span class="ml-1.5 text-xs text-muted-foreground">
          ({{ (cm.confidence * 100).toFixed(0) }}%)
        </span>
        <span
          class="ml-2 rounded-sm px-1 py-0.5 text-[10px] uppercase"
          :class="categoryBadgeClass(cm.category)"
        >
          {{ cm.category }}
        </span>
      </button>
    </div>

    <p v-if="loading" class="mt-2 text-xs text-muted-foreground">
      AI 分析中...
    </p>
  </div>
</template>
