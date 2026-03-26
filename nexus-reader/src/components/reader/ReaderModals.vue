<script setup lang="ts">
/**
 * 阅读器模态框集合组件 [Refactored v4.0]
 * 整合所有弹窗、抽屉和面板
 */
import ReaderModalsPanels from './ReaderModalsPanels.vue'
import { createReaderModalsBindings } from './reader-modals-bindings'
import type { ReaderModalsEmits } from './reader-modals-emit-types'
import type { ReaderModalsProps } from './reader-modals-prop-types'

const props = defineProps<ReaderModalsProps>()
const emit = defineEmits<ReaderModalsEmits>()
const { panelProps } = createReaderModalsBindings(props, emit)
</script>

<template>
  <ReaderModalsPanels v-bind="panelProps" />
</template>
