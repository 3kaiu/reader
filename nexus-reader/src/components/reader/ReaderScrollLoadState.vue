<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import {
  createReaderScrollLoadStateBindings,
  type ReaderScrollLoadStateProps,
} from './reader-scroll-load-state'

const props = defineProps<ReaderScrollLoadStateProps>()
const emit = defineEmits<{
  loadNextChapter: []
  retryLoad: []
}>()

const {
  showInitialParsing,
  showLoadingMore,
  showFinished,
  showLoadActions,
  hasLoadError,
} = createReaderScrollLoadStateBindings(props)
</script>

<template>
  <div v-if="showInitialParsing" class="py-20 text-center">
    <Loader2 class="w-8 h-8 animate-spin mx-auto opacity-40" />
    <p class="text-sm opacity-40 mt-3">正在解析章节...</p>
  </div>

  <div v-else-if="showLoadingMore" class="py-12 text-center">
    <Loader2 class="w-8 h-8 animate-spin mx-auto opacity-40" />
    <p class="text-sm opacity-40 mt-3">正在加载下一章...</p>
  </div>

  <div v-else-if="showFinished" class="py-16 text-center">
    <div class="inline-block px-8 py-3 bg-current/5 rounded-full">
      <p class="text-sm opacity-60">🎉 恭喜，已读完全书 🎉</p>
    </div>
  </div>

  <div v-else-if="showLoadActions" class="py-12 text-center">
    <div v-if="!hasLoadError">
      <button
        class="px-6 py-3 bg-current/10 hover:bg-current/15 rounded-full text-sm font-medium transition-colors"
        @click.stop="emit('loadNextChapter')"
      >
        加载下一章
      </button>
      <p class="text-xs opacity-30 mt-3">或继续滚动自动加载</p>
    </div>

    <div v-else class="space-y-3">
      <div
        class="px-4 py-2 bg-red-500/10 rounded-lg text-red-600 dark:text-red-400"
      >
        <p class="text-sm">⚠️ 自动加载失败</p>
        <p class="text-xs opacity-70 mt-1">{{ loadError }}</p>
      </div>
      <div class="flex gap-3 justify-center">
        <button
          class="px-4 py-2 bg-current/10 hover:bg-current/15 rounded-full text-sm font-medium transition-colors"
          @click.stop="emit('retryLoad')"
        >
          🔄 重试
        </button>
        <button
          class="px-4 py-2 bg-current/10 hover:bg-current/15 rounded-full text-sm font-medium transition-colors"
          @click.stop="emit('loadNextChapter')"
        >
          手动加载
        </button>
      </div>
      <p class="text-xs opacity-30">网络问题可能导致加载失败</p>
    </div>
  </div>
</template>
