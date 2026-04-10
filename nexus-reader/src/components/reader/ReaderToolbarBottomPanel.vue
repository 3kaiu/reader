<script setup lang="ts">
import ReaderNavigation from './ReaderNavigation.vue'
import ReaderProgress from './ReaderProgress.vue'
import ReaderToolbarBottomActions from './ReaderToolbarBottomActions.vue'
import { createReaderToolbarBottomPanelBindings } from './toolbar-bottom-panel-bindings'
import type { ReaderToolbarBottomPanelEmits } from './toolbar-bottom-panel-emit-types'
import type { ReaderToolbarBottomPanelProps } from './toolbar-bottom-panel-prop-types'

const props = defineProps<ReaderToolbarBottomPanelProps>()

const emit = defineEmits<ReaderToolbarBottomPanelEmits>()
const { navigationBindings, progressProps, actionBindings } =
  createReaderToolbarBottomPanelBindings(props, emit)
</script>

<template>
  <div
    class="reader-toolbar-glass mx-3 mb-3 rounded-2xl shadow-premium overflow-hidden border border-white/10"
  >
    <div class="px-5 pt-5 pb-4">
      <ReaderNavigation v-bind="navigationBindings" />

      <div class="mt-4">
        <ReaderProgress v-bind="progressProps" />
      </div>
    </div>
    <ReaderToolbarBottomActions v-bind="actionBindings" />
  </div>
</template>
