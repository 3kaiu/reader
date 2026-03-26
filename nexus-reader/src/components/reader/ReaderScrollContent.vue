<script setup lang="ts">
import ReaderScrollChapterList from './ReaderScrollChapterList.vue'
import ReaderScrollLoadState from './ReaderScrollLoadState.vue'
import { createReaderScrollContentBindings } from './reader-scroll-content-bindings'
import type {
  ReaderScrollContentEmits,
} from './reader-scroll-content-emit-types'
import type {
  ReaderScrollContentProps,
} from './reader-scroll-content-prop-types'

const props = defineProps<ReaderScrollContentProps>()
const emit = defineEmits<ReaderScrollContentEmits>()
const {
  contentContainerStyle,
  chapterListProps,
  loadStateProps,
} = createReaderScrollContentBindings(props)
</script>

<template>
  <div
    class="mx-auto px-6 pb-40 pt-20"
    :style="contentContainerStyle"
  >
    <ReaderScrollChapterList v-bind="chapterListProps" />

    <ReaderScrollLoadState
      v-bind="loadStateProps"
      @load-next-chapter="emit('loadNextChapter')"
      @retry-load="emit('retryLoad')"
    />
  </div>
</template>
