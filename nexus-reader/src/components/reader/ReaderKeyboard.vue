<script setup lang="ts">
/**
 * ⌨️ ReaderKeyboard - 阅读器快捷键处理组件
 */
import { onKeyStroke } from '@vueuse/core'

interface Props {
  readingMode: 'scroll' | 'swipe'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'prev': []
  'next': []
  'toggle-fullscreen': []
  'toggle-catalog': []
  'toggle-settings': []
  'toggle-day-night': []
  'toggle-zen-mode': []
  'toggle-ai-panel': []
  'toggle-insights': []
  'toggle-help': []
  'escape': []
}>()

// 导航逻辑映射
function handleNav(direction: 'prev' | 'next') {
  emit(direction)
}

// 注册快捷键
onKeyStroke(['ArrowLeft', 'ArrowUp'], (e) => { e.preventDefault(); handleNav('prev') })
onKeyStroke(['ArrowRight', 'ArrowDown', ' '], (e) => { e.preventDefault(); handleNav('next') })
onKeyStroke('Escape', () => emit('escape'))
onKeyStroke('f', () => emit('toggle-fullscreen'))
onKeyStroke('c', () => emit('toggle-catalog'))
onKeyStroke('s', () => emit('toggle-settings'))
onKeyStroke('d', () => emit('toggle-day-night'))
onKeyStroke('z', () => emit('toggle-zen-mode'))
onKeyStroke('a', () => emit('toggle-ai-panel'))
onKeyStroke('i', () => emit('toggle-insights'))
onKeyStroke(['?', 'h'], () => emit('toggle-help'))
</script>

<template>
  <!-- 纯逻辑组件，无模板 -->
  <span style="display: none" />
</template>
