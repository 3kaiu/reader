<script setup lang="ts">
/**
 * Confirmation bubble shown on first encounter of a potential alias.
 * Appears near the mapped text and offers confirm/reject actions.
 */
import type { PendingMapping } from './composables/types'

defineProps<{
  pending: PendingMapping[]
}>()

const emit = defineEmits<{
  confirm: [mapping: PendingMapping]
  reject: [alias: string]
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="pending.length > 0"
      class="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      <TransitionGroup name="bubble">
        <div
          v-for="p in pending"
          :key="p.suggestion.alias"
          class="w-72 rounded-lg border bg-popover p-3 shadow-lg text-sm"
        >
          <div class="flex items-center gap-1.5 mb-1.5">
            <span class="font-medium">"{{ p.term }}"</span>
            <span class="text-muted-foreground">→</span>
            <span>{{ p.suggestion.canonical }}</span>
          </div>

          <div v-if="p.suggestion.contextClues.length > 0" class="mb-2 text-xs text-muted-foreground">
            <div v-for="(clue, i) in p.suggestion.contextClues" :key="i">
              依据: {{ clue }}
            </div>
          </div>

          <div class="flex items-center justify-end gap-2">
            <button
              class="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              @click="emit('reject', p.suggestion.alias)"
            >
              忽略
            </button>
            <button
              class="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90"
              @click="emit('confirm', p)"
            >
              确认
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.bubble-enter-active,
.bubble-leave-active {
  transition: all 0.2s ease;
}
.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
