<script setup lang="ts">
/**
 * 阅读器主内容区组件
 * 仅保留滚动阅读模式
 */
import './reader-content.css'
import ReaderFullscreenTime from './ReaderFullscreenTime.vue'
import ReaderScrollContent from './ReaderScrollContent.vue'
import {
  createReaderContentBindings,
  type ReaderContentEmits,
  type ReaderContentProps,
} from './reader-content'
import type {
  DecodedEntity,
} from './content-types'

const props = defineProps<ReaderContentProps>()
const emit = defineEmits<ReaderContentEmits>()
const {
  scrollContentProps,
  formattedTime,
  isFullscreen,
} = createReaderContentBindings(props, {
  onEntityClick: (entity, event) => emit('entityClick', entity, event),
})
</script>

<template>
  <div class="reader-content-host reader-container">
    <ReaderScrollContent
      v-bind="scrollContentProps"
      @load-next-chapter="emit('loadNextChapter')"
      @retry-load="emit('retryLoad')"
    />

    <ReaderFullscreenTime
      v-if="isFullscreen"
      :formatted-time="formattedTime"
    />
  </div>
</template>
