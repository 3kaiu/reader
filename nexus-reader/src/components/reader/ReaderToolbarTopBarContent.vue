<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, List } from 'lucide-vue-next'
import ReaderFullscreenIcon from './ReaderFullscreenIcon.vue'
import type { ReaderToolbarTopBarContentBindings } from './toolbar-top-bar-content-bindings'

const props = defineProps<ReaderToolbarTopBarContentBindings>()

const fullscreenIconProps = computed(() => ({
  isFullscreen: props.isFullscreen,
}))
</script>

<template>
  <div
    class="reader-toolbar-glass mx-3 mt-3 px-5 py-3 rounded-2xl shadow-premium border border-white/10"
  >
    <div class="flex items-center justify-between">
      <button
        class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        @click="props.onBack"
      >
        <ArrowLeft class="w-5 h-5" />
      </button>

      <div class="flex-1 text-center px-3">
        <h1 class="font-semibold text-sm truncate">
          {{ bookName }}
        </h1>
        <p class="text-xs opacity-60 truncate mt-0.5">
          {{ chapterTitle }}
        </p>
      </div>

      <div class="flex items-center gap-1">
        <button
          class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          @click="props.onToggleCatalog"
        >
          <List class="w-5 h-5" />
        </button>
        <button
          class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          @click="props.onToggleFullscreen"
        >
          <ReaderFullscreenIcon v-bind="fullscreenIconProps" />
        </button>
      </div>
    </div>
  </div>
</template>
