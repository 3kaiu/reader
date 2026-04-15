<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { createReaderKeyboardHelpHeaderViewBindings } from './reader-keyboard-help-header-view-bindings'
import type {
  ReaderKeyboardHelpHeaderEmits,
  ReaderKeyboardHelpHeaderEmitFn,
} from './reader-keyboard-help-header-emit-types'

const emit = defineEmits<ReaderKeyboardHelpHeaderEmits>()
const { onClose } = createReaderKeyboardHelpHeaderViewBindings(
  emit as unknown as ReaderKeyboardHelpHeaderEmitFn
)
</script>

<template>
  <div class="flex items-center justify-between mb-5">
    <h3 class="font-semibold text-lg flex items-center gap-2">
      <span>⌨️</span>
      <span>快捷键</span>
    </h3>
    <button
      class="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center opacity-60 hover:opacity-100"
      @click="onClose"
    >
      <X class="w-4 h-4" />
    </button>
  </div>
</template>
