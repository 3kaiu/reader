<script setup lang="ts">
/**
 * 阅读器主内容区组件
 * 仅保留滚动阅读模式
 */
import './reader-content.css'
import ReaderContentViewport from './ReaderContentViewport.vue'
import { createReaderContentBindings } from './reader-content-bindings'
import type { ReaderContentEmits } from './reader-content-emit-types'
import type { ReaderContentProps } from './reader-content-prop-types'

const props = defineProps<ReaderContentProps>()
const emit = defineEmits<ReaderContentEmits>()
const { viewportProps } = createReaderContentBindings(props)
</script>

<template>
  <ReaderContentViewport
    v-bind="viewportProps"
    @load-next-chapter="emit('loadNextChapter')"
    @retry-load="emit('retryLoad')"
  />
</template>
