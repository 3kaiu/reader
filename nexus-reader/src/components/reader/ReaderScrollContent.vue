<script setup lang="ts">
import ReaderScrollChapter from './ReaderScrollChapter.vue'
import ReaderScrollLoadState from './ReaderScrollLoadState.vue'
import {
  createReaderScrollContentBindings,
  type ReaderScrollContentEmits,
  type ReaderScrollContentProps,
} from './reader-scroll-content'

const props = defineProps<ReaderScrollContentProps>()
const emit = defineEmits<ReaderScrollContentEmits>()
const { contentContainerStyle } = createReaderScrollContentBindings(props)
</script>

<template>
  <div
    class="mx-auto px-6 pb-40 pt-20"
    :style="contentContainerStyle"
  >
    <ReaderScrollChapter
      v-for="chapter in props.loadedChapters"
      :key="chapter.index"
      :chapter="chapter"
      :highlight-content="props.highlightContent"
      :handle-content-click="props.handleContentClick"
    />

    <ReaderScrollLoadState
      :has-loaded-chapters="props.loadedChapters.length > 0"
      :is-parsing="props.isParsing"
      :is-loading-more="props.isLoadingMore"
      :has-next-chapter="props.hasNextChapter"
      :load-error="props.loadError"
      @load-next-chapter="emit('loadNextChapter')"
      @retry-load="emit('retryLoad')"
    />
  </div>
</template>
