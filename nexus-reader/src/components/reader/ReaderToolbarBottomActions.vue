<script setup lang="ts">
import ReaderToolbarActionButton from './ReaderToolbarActionButton.vue'
import { createReaderToolbarBottomActions } from './toolbar-bottom-actions'
import type { ReaderToolbarBottomActionsEmits } from './toolbar-bottom-action-emit-types'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'

const props = defineProps<ReaderToolbarBottomActionsProps>()
const emit = defineEmits<ReaderToolbarBottomActionsEmits>()
const { actionButtons } = createReaderToolbarBottomActions(props, emit)
</script>

<template>
  <div
    class="grid grid-cols-6 grid-rows-2 sm:flex sm:flex-wrap sm:justify-evenly sm:grid-cols-none pb-2"
  >
    <ReaderToolbarActionButton
      v-for="action in actionButtons"
      :key="action.key"
      :label="action.label"
      :active-class="action.activeClass"
      :is-active="action.isActive"
      :show-indicator="action.showIndicator"
      :indicator-class="action.indicatorClass"
      @click="action.onClick"
      @contextmenu="action.onContextmenu?.($event)"
    >
      <template #icon>
        <component :is="action.icon" :class="action.iconClass" />
      </template>
    </ReaderToolbarActionButton>
  </div>
</template>
