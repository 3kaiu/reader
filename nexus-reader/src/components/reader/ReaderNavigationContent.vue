<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import ReaderNavigationButton from './ReaderNavigationButton.vue'
import ReaderNavigationProgress from './ReaderNavigationProgress.vue'
import { createReaderNavigationContentViewBindings } from './reader-navigation-content-view-bindings'
import type { ReaderNavigationContentEmits } from './reader-navigation-content-emit-types'
import type { ReaderNavigationContentProps } from './reader-navigation-content-prop-types'

const props = defineProps<ReaderNavigationContentProps>()

const emit = defineEmits<ReaderNavigationContentEmits>()
const { previousButtonBindings, nextButtonBindings, progressProps } =
  createReaderNavigationContentViewBindings(props, emit)
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <ReaderNavigationButton v-bind="previousButtonBindings">
      <template #before>
        <ChevronLeft class="w-4 h-4" />
      </template>
      上一章
    </ReaderNavigationButton>

    <ReaderNavigationProgress v-bind="progressProps" />

    <ReaderNavigationButton v-bind="nextButtonBindings">
      下一章
      <template #after>
        <ChevronRight class="w-4 h-4" />
      </template>
    </ReaderNavigationButton>
  </div>
</template>
