<script setup lang="ts">
import ReaderToolbarBottomPanel from './ReaderToolbarBottomPanel.vue'
import { createReaderToolbarBottomBarPanelBindings } from './toolbar-bottom-bar-panel-bindings'
import type { ReaderToolbarBottomBarProps } from './toolbar-bottom-bar-prop-types'

const props = defineProps<ReaderToolbarBottomBarProps>()
const { panelBindings, isVisible } = createReaderToolbarBottomBarPanelBindings(props)
</script>

<template>
  <Transition name="slide-up">
    <footer v-show="isVisible" class="fixed bottom-0 inset-x-0 z-40" @click.stop>
      <ReaderToolbarBottomPanel v-bind="panelBindings" />
    </footer>
  </Transition>
</template>
