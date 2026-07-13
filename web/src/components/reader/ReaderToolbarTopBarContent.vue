<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, List, Clock } from 'lucide-vue-next'
import ReaderFullscreenIcon from './ReaderFullscreenIcon.vue'
import { useReaderStore } from '@/stores/reader'
import { useReadingTimeDisplay } from '@/composables/reader/reading-time'
import type { ReaderToolbarTopBarContentBindings } from './toolbar-top-bar-content-bindings'

const props = defineProps<ReaderToolbarTopBarContentBindings>()

const readerStore = useReaderStore()

const fullscreenIconProps = computed(() => ({
  isFullscreen: props.isFullscreen,
}))

// 阅读时间估算
const formattedRef = computed(() => readerStore.formattedContent)
const { remainingMinutes } = useReadingTimeDisplay(formattedRef)
</script>

<template>
  <div class="reader-toolbar-glass mx-3 mt-3 px-5 py-3 rounded-2xl border border-white/10">
    <div class="flex items-center justify-between">
      <button
        class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        @click="props.onBack"
      >
        <ArrowLeft class="w-5 h-5" />
      </button>

      <div class="flex-1 text-center px-3">
        <h1 class="font-semibold text-sm truncate">
          {{ bookName }}
        </h1>
        <p class="text-xs opacity-60 truncate mt-0.5">
          {{ chapterTitle }}
        </p>
      </div>

      <div class="flex items-center gap-1">
        <!-- 阅读设置 chip — WeChat Read 风格 -->
        <button class="ir-chip ir-chip--action" type="button" @click="props.onToggleSettings">
          阅读设置
        </button>

        <!-- 阅读时间芯片 -->
        <span class="ir-chip ir-chip--time">
          <Clock class="w-3 h-3 opacity-60" />
          约{{ remainingMinutes }}分钟
        </span>

        <button
          class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          @click="props.onToggleCatalog"
        >
          <List class="w-5 h-5" />
        </button>
        <button
          class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          @click="props.onToggleFullscreen"
        >
          <ReaderFullscreenIcon v-bind="fullscreenIconProps" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 阅读时间芯片 — 玻璃拟态胶囊 */
.ir-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--ir-border, rgba(0, 0, 0, 0.1));
  font-size: 11px;
  white-space: nowrap;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.ir-chip--time {
  gap: 3px;
  color: var(--ir-muted, rgba(0, 0, 0, 0.4));
  background: var(--ir-card-bg, rgba(255, 255, 255, 0.5));
}

.ir-chip--action {
  cursor: pointer;
  font: inherit;
  color: var(--ir-muted, rgba(0, 0, 0, 0.4));
  background: var(--ir-card-bg, rgba(255, 255, 255, 0.5));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.ir-chip--action:hover {
  border-color: var(--ir-accent, #5c8e76);
  color: var(--ir-text, #1c2e24);
  background: var(--ir-panel-hover, rgba(251, 253, 248, 0.9));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    var(--ir-shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.ir-chip--action:active {
  transform: scale(0.97);
}

@media (max-width: 760px) {
  .ir-chip--time {
    display: none;
  }
}
</style>
