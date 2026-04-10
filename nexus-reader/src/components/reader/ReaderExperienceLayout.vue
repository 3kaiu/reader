<script setup lang="ts">
import ReaderContent from '@/components/reader/ReaderContent.vue'
import ReaderModals from '@/components/reader/ReaderModals.vue'
import ReaderToolbar from '@/components/reader/ReaderToolbar.vue'
import type { ReaderExperienceLayoutProps } from './reader-experience-layout-prop-types'

defineProps<ReaderExperienceLayoutProps>()
</script>

<template>
  <ReaderToolbar v-bind="toolbarBindings.value" />

  <ReaderContent :ref="contentRef" v-bind="contentBindings.value" />

  <ReaderModals v-bind="modalBindings.value" />
</template>
