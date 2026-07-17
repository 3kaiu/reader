<script setup lang="ts">
/**
 * Sidebar panel showing AI-extracted context for the current chapter:
 * known alias mappings, event references, and summary.
 */
import type { ChapterContextEntry, EventContextEntry } from './composables/useAiContext'

defineProps<{
  open: boolean
  aliases: ChapterContextEntry[]
  events: EventContextEntry[]
  summary: string | null
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Transition name="panel-slide">
    <div
      v-if="open"
      class="fixed right-0 top-0 z-40 h-full w-80 border-l bg-background p-4 shadow-lg overflow-y-auto"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">AI 上下文</h2>
        <button
          class="text-muted-foreground hover:text-foreground"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <!-- Summary -->
      <section v-if="summary" class="mb-4">
        <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
          章节摘要
        </h3>
        <p class="text-sm text-foreground">{{ summary }}</p>
      </section>

      <!-- Known aliases -->
      <section v-if="aliases.length > 0" class="mb-4">
        <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          人物/代指 ({{ aliases.length }})
        </h3>
        <div class="space-y-2">
          <div
            v-for="a in aliases"
            :key="a.alias"
            class="rounded-md border p-2.5 text-sm"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ a.alias }}</span>
              <span class="text-muted-foreground">→</span>
              <span>{{ a.canonical }}</span>
            </div>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ a.contextSnippet }}
            </p>
          </div>
        </div>
      </section>

      <!-- Events -->
      <section v-if="events.length > 0">
        <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          事件隐喻 ({{ events.length }})
        </h3>
        <div class="space-y-2">
          <div
            v-for="e in events"
            :key="e.reference"
            class="rounded-md border p-2.5 text-sm"
          >
            <div class="font-medium">{{ e.reference }}</div>
            <p v-if="e.description" class="mt-0.5 text-muted-foreground">
              {{ e.description }}
            </p>
          </div>
        </div>
      </section>

      <p v-if="aliases.length === 0 && events.length === 0" class="text-sm text-muted-foreground">
        尚未扫描本章。打开 AI 扫描后这里会显示提取结果。
      </p>
    </div>
  </Transition>
</template>

<style scoped>
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 0.2s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
}
</style>
