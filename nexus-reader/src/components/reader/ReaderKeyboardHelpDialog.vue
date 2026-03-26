<script setup lang="ts">
import ReaderKeyboardHelpHeader from './ReaderKeyboardHelpHeader.vue'
import ReaderKeyboardShortcutItem from './ReaderKeyboardShortcutItem.vue'
import type {
  ReaderKeyboardHelpDialogEmits,
} from './reader-keyboard-help-dialog-emit-types'
import type {
  ReaderKeyboardHelpDialogProps,
} from './reader-keyboard-help-dialog-prop-types'

defineProps<ReaderKeyboardHelpDialogProps>()

const emit = defineEmits<ReaderKeyboardHelpDialogEmits>()
</script>

<template>
  <div
    class="bg-card rounded-2xl p-6 max-w-md w-full shadow-2xl border border-border/50"
    @click.stop
  >
    <ReaderKeyboardHelpHeader @close="emit('close')" />
    <div class="grid grid-cols-2 gap-3">
      <ReaderKeyboardShortcutItem
        v-for="shortcut in shortcutItems"
        :key="shortcut.key"
        :shortcut="shortcut"
      />
    </div>
  </div>
</template>
