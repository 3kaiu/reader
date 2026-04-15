<script setup lang="ts">
import { createReaderToolbarActionButtonViewBindings } from './reader-toolbar-action-button-view-bindings'
import type { ReaderToolbarActionButtonProps } from './reader-toolbar-action-button-view-bindings'

const props = defineProps<ReaderToolbarActionButtonProps>()
const { buttonClass, onClick, onContextmenu } = createReaderToolbarActionButtonViewBindings(props)
</script>

<template>
  <button
    class="reader-toolbar-item group relative"
    :class="buttonClass"
    @click="onClick"
    @contextmenu.prevent="onContextmenu"
  >
    <div
      class="reader-toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform"
    >
      <slot name="icon" />
      <span
        v-if="showIndicator"
        class="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse"
        :class="indicatorClass"
      />
    </div>
    <span class="reader-toolbar-item-label">{{ label }}</span>
  </button>
</template>
