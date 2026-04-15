<script setup lang="ts">
import ReaderToolbarActionButton from './ReaderToolbarActionButton.vue'
import {
  createReaderToolbarBottomActions,
  type ReaderToolbarBottomActionsBindings,
} from './toolbar-bottom-actions'

const props = defineProps<ReaderToolbarBottomActionsBindings>()
const { actionButtons } = createReaderToolbarBottomActions(props)
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
      :on-click="action.onClick"
      :on-contextmenu="action.onContextmenu"
    >
      <template #icon>
        <component :is="action.icon" :class="action.iconClass" />
      </template>
    </ReaderToolbarActionButton>
  </div>
</template>
