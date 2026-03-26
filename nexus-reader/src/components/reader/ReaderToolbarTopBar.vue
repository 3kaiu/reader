<script setup lang="ts">
import ReaderToolbarTopBarContent from './ReaderToolbarTopBarContent.vue'
import {
  createReaderToolbarTopBarBindings,
} from './toolbar-top-bar-content-bindings'
import type { ReaderToolbarTopBarEmits } from './toolbar-top-bar-emit-types'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

const props = defineProps<ReaderToolbarTopBarProps>()

const emit = defineEmits<ReaderToolbarTopBarEmits>()
const {
  contentBindings,
  isVisible,
} = createReaderToolbarTopBarBindings(props, emit)
</script>

<template>
  <Transition name="slide-down">
    <header
      v-show="isVisible"
      class="fixed top-0 inset-x-0 z-40"
      @click.stop
    >
      <ReaderToolbarTopBarContent v-bind="contentBindings" />
    </header>
  </Transition>
</template>
