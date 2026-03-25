<script setup lang="ts">
/**
 * ⌨️ ReaderKeyboard - 阅读器快捷键处理组件
 */
import {
  registerReaderKeyboardShortcuts,
  type ReaderKeyboardEmits,
} from './reader-keyboard'

const emit = defineEmits<ReaderKeyboardEmits>()

registerReaderKeyboardShortcuts(emit)
</script>

<template>
  <!-- 纯逻辑组件，无模板 -->
  <span style="display: none" />
</template>
