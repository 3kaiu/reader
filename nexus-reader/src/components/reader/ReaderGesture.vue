<script setup lang="ts">
/**
 * 👆 ReaderGesture - 阅读器交互手势组件
 */
import { ref } from 'vue'
import { useReaderGesture } from '@/composables/useReaderGesture'

interface Props {
  readingMode: 'scroll' | 'swipe'
  zenMode: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'toggle-toolbar': []
  'toggle-zen-mode': []
  'prev': []
  'next': []
  'long-press': [e: MouseEvent | TouchEvent]
}>()

const containerRef = ref<HTMLElement | null>(null)

const { handleAreaClick } = useReaderGesture({
  containerRef,
  readingMode: props.readingMode,
  zenMode: props.zenMode,
  onToggleToolbar: () => emit('toggle-toolbar'),
  onToggleZenMode: () => emit('toggle-zen-mode'),
  onPrevPage: () => emit('prev'),
  onNextPage: () => emit('next'),
  onLongPress: (e) => emit('long-press', e)
})
</script>

<template>
  <div 
    ref="containerRef"
    class="reader-gesture-layer z-[5] pointer-events-auto"
    :class="readingMode === 'swipe' ? 'fixed inset-0' : 'relative min-h-[100vh] cursor-default'"
    @click="handleAreaClick"
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
