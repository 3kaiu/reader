<script setup lang="ts">
/**
 * 阅读器章节导航组件
 * 包含上一章/下一章切换按钮和进度文字
 */
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import {
  createReaderNavigationBindings,
  type ReaderNavigationEmits,
  type ReaderNavigationProps,
} from './reader-navigation'

const props = defineProps<ReaderNavigationProps>()
const emit = defineEmits<ReaderNavigationEmits>()
const {
  progressText,
  progressPercent,
} = createReaderNavigationBindings(props)
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <!-- 上一章按钮 -->
    <button
      :disabled="!hasPrevChapter"
      class="chapter-nav-btn"
      :class="{ 'disabled': !hasPrevChapter }"
      @click="emit('prev')"
    >
      <ChevronLeft class="w-4 h-4" />
      <span>上一章</span>
    </button>
    
    <!-- 进度信息 -->
    <div class="flex-1 text-center">
      <div class="text-sm font-medium">
        {{ progressText }}
      </div>
      <div class="text-[10px] opacity-50 mt-0.5">
        {{ progressPercent }}%
      </div>
    </div>
    
    <!-- 下一章按钮 -->
    <button
      :disabled="!hasNextChapter"
      class="chapter-nav-btn"
      :class="{ 'disabled': !hasNextChapter }"
      @click="emit('next')"
    >
      <span>下一章</span>
      <ChevronRight class="w-4 h-4" />
    </button>
  </div>
</template>

<style scoped>
.chapter-nav-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(var(--foreground-rgb), 0.05);
  border: 1px solid rgba(var(--foreground-rgb), 0.1);
  border-radius: 99px;
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.2s;
}

.chapter-nav-btn:not(.disabled):active {
  background: rgba(var(--foreground-rgb), 0.1);
  transform: translateY(1px);
}

.chapter-nav-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
