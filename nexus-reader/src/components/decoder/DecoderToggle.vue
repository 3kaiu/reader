<script setup lang="ts">
/**
 * 解密开关组件
 * 显示在工具栏中，支持点击切换和长按打开设置
 */
import { ref, computed, onUnmounted } from 'vue'
import { Sparkles, Loader2 } from 'lucide-vue-next'
import { useDecoderStore } from '@/stores/decoder'

interface Props {
  /** 书籍 URL */
  bookUrl: string
  /** 是否正在解码 */
  isDecoding?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isDecoding: false,
})

const emit = defineEmits<{
  toggle: [enabled: boolean]
  openSettings: []
}>()

const decoderStore = useDecoderStore()

// 长按检测
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const isLongPress = ref(false)

/** 当前书籍是否启用解密 */
const isEnabled = computed(() => {
  return decoderStore.getBookSettings(props.bookUrl).enabled
})

/** 处理点击 */
function handleClick() {
  if (isLongPress.value) {
    isLongPress.value = false
    return
  }
  const newEnabled = !isEnabled.value
  decoderStore.updateBookSettings(props.bookUrl, { enabled: newEnabled })
  emit('toggle', newEnabled)
}

/** 开始长按 */
function handlePointerDown() {
  isLongPress.value = false
  longPressTimer.value = setTimeout(() => {
    isLongPress.value = true
    emit('openSettings')
  }, 500)
}

/** 结束长按 */
function handlePointerUp() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

/** 取消长按 */
function handlePointerCancel() {
  handlePointerUp()
  isLongPress.value = false
}

onUnmounted(() => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
  }
})
</script>

<template>
  <button
    class="decoder-toggle toolbar-item group relative"
    :class="{ 'text-purple-500': isEnabled, 'opacity-50': isDecoding }"
    :disabled="isDecoding"
    @click="handleClick"
    @pointerdown="handlePointerDown"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
    @pointerleave="handlePointerCancel"
  >
    <div class="toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform">
      <Loader2 v-if="isDecoding" class="w-5 h-5 animate-spin" />
      <Sparkles v-else class="w-5 h-5" />
    </div>
    <span class="toolbar-item-label">{{ isEnabled ? '解密中' : '解密' }}</span>
    
    <!-- 启用状态指示点 -->
    <span
      v-if="isEnabled && !isDecoding"
      class="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse"
    />
  </button>
</template>

<style scoped>
.decoder-toggle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 0;
  gap: 0.25rem;
  transition: all 0.2s;
  border-radius: 0.5rem;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.decoder-toggle:active {
  background: rgba(var(--foreground-rgb), 0.05);
}

.toolbar-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1.5rem;
  width: 1.5rem;
  opacity: 0.8;
}

.toolbar-item-label {
  font-size: 0.65rem;
  font-weight: 500;
  opacity: 0.6;
}
</style>
