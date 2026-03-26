<script setup lang="ts">
import { ArrowLeft, List } from 'lucide-vue-next'
import ReaderFullscreenIcon from './ReaderFullscreenIcon.vue'
import {
  createReaderToolbarTopBarContentViewBindings,
} from './toolbar-top-bar-content-view-bindings'
import type { ReaderToolbarTopBarEmits } from './toolbar-top-bar-emit-types'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

const props = defineProps<ReaderToolbarTopBarProps>()

const emit = defineEmits<ReaderToolbarTopBarEmits>()
const {
  fullscreenIconProps,
  onBack,
  onToggleCatalog,
  onToggleFullscreen,
} = createReaderToolbarTopBarContentViewBindings(props, emit)
</script>

<template>
  <div
    class="reader-toolbar-glass mx-3 mt-3 px-5 py-3 rounded-2xl shadow-premium border border-white/10"
  >
    <div class="flex items-center justify-between">
      <button
        class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        @click="onBack"
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
          @click="onToggleCatalog"
        >
          <List class="w-5 h-5" />
        </button>
        <button
          class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          @click="onToggleFullscreen"
        >
          <ReaderFullscreenIcon v-bind="fullscreenIconProps" />
        </button>
      </div>
    </div>
  </div>
</template>
