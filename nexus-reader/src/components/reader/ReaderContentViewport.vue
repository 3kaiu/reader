<script setup lang="ts">
import ReaderFullscreenTime from './ReaderFullscreenTime.vue'
import ReaderScrollContent from './ReaderScrollContent.vue'
import {
  createReaderContentViewportViewBindings,
} from './reader-content-viewport-view-bindings'
import type {
  ReaderContentViewportEmits,
} from './reader-content-viewport-emit-types'
import type {
  ReaderContentViewportProps,
} from './reader-content-viewport-prop-types'

const props = defineProps<ReaderContentViewportProps>()
const emit = defineEmits<ReaderContentViewportEmits>()
const {
  showFullscreenTime,
  fullscreenTimeProps,
  onLoadNextChapter,
  onRetryLoad,
} = createReaderContentViewportViewBindings(props, emit)
</script>

<template>
  <div class="reader-content-host reader-container">
    <ReaderScrollContent
      v-bind="scrollContentProps"
      @load-next-chapter="onLoadNextChapter"
      @retry-load="onRetryLoad"
    />

    <ReaderFullscreenTime
      v-if="showFullscreenTime"
      v-bind="fullscreenTimeProps"
    />
  </div>
</template>
