<script setup lang="ts">
/**
 * 阅读器进度条组件
 */
import { createReaderProgressViewBindings } from './reader-progress-view-bindings'
import type { ReaderProgressProps } from './reader-progress-view-bindings'

const props = defineProps<ReaderProgressProps>()
const { fillStyle } = createReaderProgressViewBindings(props)
</script>

<template>
  <div class="progress-track">
    <div class="progress-fill" :style="fillStyle" />
  </div>
</template>

<style scoped>
.progress-track {
  height: 3px;
  background: rgba(var(--foreground-rgb), 0.05);
  border-radius: 99px;
  overflow: hidden;
  width: 100%;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  opacity: 0.6;
  border-radius: 99px;
  transition: width 0.3s ease;
}
</style>
