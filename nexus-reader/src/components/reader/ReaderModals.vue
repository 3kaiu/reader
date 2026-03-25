<script setup lang="ts">
/**
 * 阅读器模态框集合组件 [Refactored v4.0]
 * 整合所有弹窗、抽屉和面板
 */
import ChapterList from '@/components/book/ChapterList.vue'
import BookInfoModal from '@/components/book/BookInfoModal.vue'
import BookSourcePicker from '@/components/book/BookSourcePicker.vue'
import ReadSettings from '@/components/ReadSettings.vue'
import ReaderKeyboardHelpOverlay from '@/components/reader/ReaderKeyboardHelpOverlay.vue'
import {
  createReaderModalsBindings,
  type ReaderModalsEmits,
  type ReaderModalsProps,
} from './reader-modals'

const props = defineProps<ReaderModalsProps>()
const emit = defineEmits<ReaderModalsEmits>()
const {
  chapterListBindings,
  settingsBindings,
  sourcePickerBindings,
  bookInfoBindings,
  keyboardHelpBindings,
} = createReaderModalsBindings(props, emit)
</script>

<template>
  <div>
    <ChapterList v-bind="chapterListBindings" />

    <ReadSettings v-bind="settingsBindings" />

    <BookSourcePicker v-bind="sourcePickerBindings" />

    <BookInfoModal v-bind="bookInfoBindings" />

    <ReaderKeyboardHelpOverlay v-bind="keyboardHelpBindings" />
  </div>
</template>
