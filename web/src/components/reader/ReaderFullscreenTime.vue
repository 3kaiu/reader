<script setup lang="ts">
import {
  createReaderFullscreenTimeViewBindings,
  type ReaderFullscreenTimeProps,
} from './reader-ui.types'

const props = defineProps<ReaderFullscreenTimeProps>()
const { displayTime } = createReaderFullscreenTimeViewBindings(props)
</script>

<template>
  <div class="fixed top-4 right-6 text-xs opacity-30 font-mono pointer-events-none z-50">
    {{ displayTime }}
  </div>
</template>
