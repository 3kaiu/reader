<script setup lang="ts">
import ReaderToolbarBottomBar from './ReaderToolbarBottomBar.vue'
import ReaderToolbarTopBar from './ReaderToolbarTopBar.vue'
import { createReaderToolbarPanelsBindings } from './toolbar-panels-bindings'
import type { ReaderToolbarPanelsEmits } from './toolbar-panels-emit-types'
import type { ReaderToolbarPanelsProps } from './toolbar-panels-prop-types'

const props = defineProps<ReaderToolbarPanelsProps>()

const emit = defineEmits<ReaderToolbarPanelsEmits>()
const {
  topBarBindings,
  bottomBarBindings,
} = createReaderToolbarPanelsBindings(props, emit)
</script>

<template>
  <div>
    <ReaderToolbarTopBar v-bind="topBarBindings" />

    <ReaderToolbarBottomBar v-bind="bottomBarBindings" />
  </div>
</template>
