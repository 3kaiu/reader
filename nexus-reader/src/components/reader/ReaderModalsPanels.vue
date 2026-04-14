<script setup lang="ts">
import ChapterList from '@/components/book/ChapterList.vue'
import BookInfoModal from '@/components/book/BookInfoModal.vue'
import BookSourcePicker from '@/components/book/BookSourcePicker.vue'
import ReadSettings from '@/components/ReadSettings.vue'
import ReaderKeyboardHelpOverlay from '@/components/reader/ReaderKeyboardHelpOverlay.vue'
import type { ReaderModalsPanelBindings } from './reader-modals-panel-binding-types'

defineProps<ReaderModalsPanelBindings>()
</script>

<template>
  <div>
    <ChapterList v-bind="chapterListBindings.value" />

    <ReadSettings v-bind="settingsBindings.value" />

    <BookSourcePicker v-bind="sourcePickerBindings.value" />

    <BookInfoModal v-bind="bookInfoBindings.value" />

    <ReaderKeyboardHelpOverlay v-bind="keyboardHelpBindings.value" />
  </div>
</template>
