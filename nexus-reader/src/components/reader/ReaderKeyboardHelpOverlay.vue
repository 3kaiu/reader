<script setup lang="ts">
import { X } from 'lucide-vue-next'
import {
  createReaderKeyboardHelpOverlayBindings,
  type ReaderKeyboardHelpOverlayEmits,
  type ReaderKeyboardHelpOverlayProps,
} from './reader-keyboard-help-overlay'

const props = defineProps<ReaderKeyboardHelpOverlayProps>()
const emit = defineEmits<ReaderKeyboardHelpOverlayEmits>()
const { shortcutItems, close } = createReaderKeyboardHelpOverlayBindings(
  props,
  emit,
)
</script>

<template>
  <Transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      @click="close"
    >
      <div
        class="bg-card rounded-2xl p-6 max-w-md w-full shadow-2xl border border-border/50"
        @click.stop
      >
        <div class="flex items-center justify-between mb-5">
          <h3 class="font-semibold text-lg flex items-center gap-2">
            <span>⌨️</span>
            <span>快捷键</span>
          </h3>
          <button
            class="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center opacity-60 hover:opacity-100"
            @click="close"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="shortcut in shortcutItems"
            :key="shortcut.key"
            class="flex items-center gap-3"
          >
            <kbd class="px-2 py-1 bg-muted rounded text-[10px] font-mono border">
              {{ shortcut.key }}
            </kbd>
            <span class="text-xs opacity-70">{{ shortcut.desc }}</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
