<script setup lang="ts">
import { createReaderKeyboardShortcutItemViewBindings } from './reader-keyboard-shortcut-item-view-bindings'
import type { ReaderKeyboardShortcutItemProps } from './reader-keyboard-shortcut-item-prop-types'

const props = defineProps<ReaderKeyboardShortcutItemProps>()
const { shortcutKey, shortcutDescription } = createReaderKeyboardShortcutItemViewBindings(props)
</script>

<template>
  <div class="flex items-center gap-3">
    <kbd class="px-2 py-1 bg-muted rounded text-[10px] font-mono border">
      {{ shortcutKey }}
    </kbd>
    <span class="text-xs opacity-70">{{ shortcutDescription }}</span>
  </div>
</template>
