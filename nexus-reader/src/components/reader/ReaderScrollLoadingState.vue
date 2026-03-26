<script setup lang="ts">
import type {
  ReaderScrollLoadingStateProps,
} from './reader-scroll-loading-state-prop-types'
import { Loader2 } from 'lucide-vue-next'

withDefaults(
  defineProps<ReaderScrollLoadingStateProps>(),
  {
    containerClass: 'py-12 text-center',
  },
)
</script>

<template>
  <div :class="containerClass">
    <Loader2 class="w-8 h-8 animate-spin mx-auto opacity-40" />
    <p class="text-sm opacity-40 mt-3">{{ message }}</p>
  </div>
</template>
