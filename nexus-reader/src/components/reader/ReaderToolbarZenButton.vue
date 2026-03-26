<script setup lang="ts">
import { X } from 'lucide-vue-next'
import {
  createReaderToolbarZenButtonViewBindings,
} from './toolbar-zen-button-view-bindings'
import type {
  ReaderToolbarZenButtonEmits,
  ReaderToolbarZenButtonEmitFn,
} from './toolbar-zen-button-emit-types'
import type { ReaderToolbarZenButtonProps } from './toolbar-zen-button-prop-types'

const props = defineProps<ReaderToolbarZenButtonProps>()
const emit = defineEmits<ReaderToolbarZenButtonEmits>()
const {
  isVisible,
  onExit,
} = createReaderToolbarZenButtonViewBindings(
  props,
  emit as unknown as ReaderToolbarZenButtonEmitFn,
)
</script>

<template>
  <Transition name="fade">
    <div
      v-if="isVisible"
      class="fixed top-6 right-6 z-50 animate-in fade-in duration-700"
    >
      <button
        class="w-10 h-10 rounded-full bg-background/20 hover:bg-background/40 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all hover:scale-110 active:scale-90"
        title="退出禅模式"
        @click="onExit"
      >
        <X class="w-5 h-5 text-foreground/40 hover:text-foreground/80" />
      </button>
    </div>
  </Transition>
</template>
