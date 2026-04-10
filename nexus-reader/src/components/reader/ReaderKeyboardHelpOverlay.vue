<script setup lang="ts">
import ReaderKeyboardHelpDialog from './ReaderKeyboardHelpDialog.vue'
import { createReaderKeyboardHelpOverlayBindings } from './reader-keyboard-help-overlay-bindings'
import type { ReaderKeyboardHelpOverlayEmits } from './reader-keyboard-help-overlay-emit-types'
import type { ReaderKeyboardHelpOverlayProps } from './reader-keyboard-help-overlay-prop-types'

const props = defineProps<ReaderKeyboardHelpOverlayProps>()
const emit = defineEmits<ReaderKeyboardHelpOverlayEmits>()
const { isOpen, dialogProps, onClose } = createReaderKeyboardHelpOverlayBindings(props, emit)
</script>

<template>
  <Transition name="fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      @click="onClose"
    >
      <ReaderKeyboardHelpDialog v-bind="dialogProps" @close="onClose" />
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
