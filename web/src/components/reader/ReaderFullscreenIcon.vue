<script setup lang="ts">
import { createReaderFullscreenIconViewBindings } from './reader-fullscreen-icon-view-bindings'

const props = defineProps<{
  isFullscreen: boolean
}>()
const { pathData } = createReaderFullscreenIconViewBindings(props)
</script>

<template>
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="pathData" />
  </svg>
</template>
