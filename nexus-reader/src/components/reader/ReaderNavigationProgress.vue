<script setup lang="ts">
import {
  createReaderNavigationProgressViewBindings,
} from './reader-navigation-progress-view-bindings'
import type { ReaderNavigationProgressProps } from './reader-navigation-progress-prop-types'

const props = defineProps<ReaderNavigationProgressProps>()
const {
  chapterProgressText,
  progressPercentText,
} = createReaderNavigationProgressViewBindings(props)
</script>

<template>
  <div class="flex-1 text-center">
    <div class="text-sm font-medium">
      {{ chapterProgressText }}
    </div>
    <div class="text-[10px] opacity-50 mt-0.5">
      {{ progressPercentText }}
    </div>
  </div>
</template>
