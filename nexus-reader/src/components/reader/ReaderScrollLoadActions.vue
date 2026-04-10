<script setup lang="ts">
import { createReaderScrollLoadActionsViewBindings } from './reader-scroll-load-actions-view-bindings'
import type { ReaderScrollLoadActionsEmits } from './reader-scroll-load-actions-emit-types'
import type { ReaderScrollLoadActionsProps } from './reader-scroll-load-actions-prop-types'

const props = defineProps<ReaderScrollLoadActionsProps>()
const emit = defineEmits<ReaderScrollLoadActionsEmits>()
const { hasLoadError, onLoadNextChapter, onRetryLoad } = createReaderScrollLoadActionsViewBindings(
  props,
  emit
)
</script>

<template>
  <div class="py-12 text-center">
    <div v-if="!hasLoadError">
      <button
        class="px-6 py-3 bg-current/10 hover:bg-current/15 rounded-full text-sm font-medium transition-colors"
        @click.stop="onLoadNextChapter"
      >
        加载下一章
      </button>
      <p class="text-xs opacity-30 mt-3">或继续滚动自动加载</p>
    </div>

    <div v-else class="space-y-3">
      <div class="px-4 py-2 bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
        <p class="text-sm">⚠️ 自动加载失败</p>
        <p class="text-xs opacity-70 mt-1">{{ loadError }}</p>
        <p v-if="loadErrorDetails" class="text-[11px] opacity-60 mt-1 break-words">
          {{ loadErrorDetails }}
        </p>
      </div>
      <div class="flex gap-3 justify-center">
        <button
          class="px-4 py-2 bg-current/10 hover:bg-current/15 rounded-full text-sm font-medium transition-colors"
          @click.stop="onRetryLoad"
        >
          🔄 重试
        </button>
        <button
          class="px-4 py-2 bg-current/10 hover:bg-current/15 rounded-full text-sm font-medium transition-colors"
          @click.stop="onLoadNextChapter"
        >
          手动加载
        </button>
      </div>
      <p class="text-xs opacity-30">网络问题可能导致加载失败</p>
    </div>
  </div>
</template>
