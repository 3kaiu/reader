<script setup lang="ts">
import ReaderToolbarBottomBar from './ReaderToolbarBottomBar.vue'
import ReaderToolbarTopBar from './ReaderToolbarTopBar.vue'
import { createReaderToolbarPanelsBindings } from './toolbar-panels-bindings'
import type { ReaderToolbarPanelsProps } from './toolbar-panels-prop-types'

const props = defineProps<ReaderToolbarPanelsProps>()

const { topBarBindings, bottomBarBindings } = createReaderToolbarPanelsBindings(props)
</script>

<template>
  <div>
    <ReaderToolbarTopBar v-bind="topBarBindings" />

    <ReaderToolbarBottomBar v-bind="bottomBarBindings" />
  </div>
</template>
