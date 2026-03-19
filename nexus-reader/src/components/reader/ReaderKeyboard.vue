<script setup lang="ts">
/**
 * ⌨️ ReaderKeyboard - 阅读器快捷键处理组件
 */
import { onKeyStroke } from '@vueuse/core'

const emit = defineEmits<{
  'prev': []
  'next': []
  'toggle-fullscreen': []
  'toggle-catalog': []
  'toggle-settings': []
  'toggle-day-night': []
  'toggle-zen-mode': []
  'toggle-help': []
  'escape': []
}>()

function isEditableTarget(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return false

  const tagName = target.tagName
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  )
}

// 导航逻辑映射
function handleNav(direction: 'prev' | 'next') {
  emit(direction)
}

// 注册快捷键
onKeyStroke(['ArrowLeft', 'ArrowUp'], (e) => {
  if (isEditableTarget(e)) return
  e.preventDefault()
  handleNav('prev')
})
onKeyStroke(['ArrowRight', 'ArrowDown', ' '], (e) => {
  if (isEditableTarget(e)) return
  e.preventDefault()
  handleNav('next')
})
onKeyStroke('Escape', (e) => {
  if (isEditableTarget(e)) return
  emit('escape')
})
onKeyStroke('f', (e) => {
  if (isEditableTarget(e)) return
  emit('toggle-fullscreen')
})
onKeyStroke('c', (e) => {
  if (isEditableTarget(e)) return
  emit('toggle-catalog')
})
onKeyStroke('s', (e) => {
  if (isEditableTarget(e)) return
  emit('toggle-settings')
})
onKeyStroke('d', (e) => {
  if (isEditableTarget(e)) return
  emit('toggle-day-night')
})
onKeyStroke('z', (e) => {
  if (isEditableTarget(e)) return
  emit('toggle-zen-mode')
})
onKeyStroke(['?', 'h'], (e) => {
  if (isEditableTarget(e)) return
  emit('toggle-help')
})
</script>

<template>
  <!-- 纯逻辑组件，无模板 -->
  <span style="display: none" />
</template>
