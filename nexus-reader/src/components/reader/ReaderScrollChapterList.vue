<script setup lang="ts">
import ReaderScrollChapter from './ReaderScrollChapter.vue'
import {
  createReaderScrollChapterListBindings,
} from './reader-scroll-chapter-list-bindings'
import type {
  ReaderScrollChapterListProps,
} from './reader-scroll-chapter-list-prop-types'

const props = defineProps<ReaderScrollChapterListProps>()
const { chapterItemPropsList } = createReaderScrollChapterListBindings(props)
</script>

<template>
  <ReaderScrollChapter
    v-for="chapterProps in chapterItemPropsList"
    :key="chapterProps.chapter.index"
    v-bind="chapterProps"
  />
</template>
