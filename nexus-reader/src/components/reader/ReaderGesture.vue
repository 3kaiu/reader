<script setup lang="ts">
/**
 * 👆 ReaderGesture - 阅读器交互手势组件
 */
const emit = defineEmits<{
  'toggle-toolbar': []
  'toggle-zen-mode': []
}>()
</script>

<template>
  <div
    class="reader-gesture-layer relative min-h-[100vh] cursor-default z-[5] pointer-events-auto"
    @click="emit('toggle-toolbar')"
    @dblclick="emit('toggle-zen-mode')"
  >
    <slot />
  </div>
</template>

<style scoped>
.reader-gesture-layer {
  /* 透明层，仅用于捕获事件 */
  background: transparent;
}
</style>
