<script setup lang="ts">
import ReaderContent from "@/components/reader/ReaderContent.vue";
import ReaderAssistLayers from "@/components/reader/ReaderAssistLayers.vue";
import ReaderModals from "@/components/reader/ReaderModals.vue";
import ReaderToolbar from "@/components/reader/ReaderToolbar.vue";
import {
  createReaderExperienceComponentBindings,
  type ReaderExperienceProps,
} from "./reader-experience";

const props = defineProps<ReaderExperienceProps>();

const {
  toolbarBindings,
  contentBindings,
  modalBindings,
  assistBindings,
  contentRef,
} = createReaderExperienceComponentBindings(props);
</script>

<template>
  <ReaderToolbar v-bind="toolbarBindings" />

  <ReaderContent
    :ref="contentRef"
    v-bind="contentBindings"
  />

  <ReaderModals v-bind="modalBindings" />

  <ReaderAssistLayers v-bind="assistBindings" />
</template>
