<script setup lang="ts">
/**
 * 阅读器底部工具栏组件
 */
import { computed } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Type,
  ArrowLeftRight,
  RotateCcw,
  Pause,
  Play,
  Volume2,
} from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useReaderStore } from '@/stores/reader'
import { useTTS } from '@/composables/useTTS'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'prev-chapter': []
  'next-chapter': []
  'toggle-night-mode': []
  'toggle-settings': []
  'toggle-source-picker': []
  'refresh': []
  'toggle-ai-panel': []
  'toggle-tts': []
}>()

const settingsStore = useSettingsStore()
const readerStore = useReaderStore()
const tts = useTTS()

const isNightMode = computed(() => settingsStore.config.theme === 'night')
const progressPercentage = computed(() => {
  if (readerStore.totalChapters === 0) return 0
  return Math.round(((readerStore.currentChapterIndex + 1) / readerStore.totalChapters) * 100)
})
</script>

<template>
  <Transition name="slide-up">
    <footer
      v-show="show"
      class="fixed bottom-0 inset-x-0 z-40"
      @click.stop
    >
      <div class="toolbar-glass mx-3 mb-3 rounded-2xl shadow-lg overflow-hidden">
        <!-- 进度区域 -->
        <div class="px-4 pt-4 pb-3">
          <!-- 章节切换按钮 + 进度信息 -->
          <div class="flex items-center justify-between gap-4">
            <!-- 上一章按钮 -->
            <button
              :disabled="!readerStore.hasPrevChapter"
              class="chapter-nav-btn"
              :class="{ 'disabled': !readerStore.hasPrevChapter }"
              @click="emit('prev-chapter')"
            >
              <ChevronLeft class="w-4 h-4" />
              <span>上一章</span>
            </button>

            <!-- 进度信息 -->
            <div class="flex-1 text-center">
              <div class="text-sm font-medium">
                {{ readerStore.currentChapterIndex + 1 }} / {{ readerStore.totalChapters }}
              </div>
              <div class="text-[10px] opacity-50 mt-0.5">
                {{ progressPercentage }}%
              </div>
            </div>

            <!-- 下一章按钮 -->
            <button
              :disabled="!readerStore.hasNextChapter"
              class="chapter-nav-btn"
              :class="{ 'disabled': !readerStore.hasNextChapter }"
              @click="emit('next-chapter')"
            >
              <span>下一章</span>
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>

          <!-- 进度条 -->
          <div class="progress-track mt-3">
            <div
              class="progress-fill"
              :style="{ width: `${progressPercentage}%` }"
            />
          </div>
        </div>

        <!-- 功能按钮区 -->
        <div class="grid grid-cols-6">
          <!-- 亮度/主题 -->
          <button class="toolbar-item" @click="emit('toggle-night-mode')">
            <div class="toolbar-item-icon">
              <Moon v-if="!isNightMode" class="w-5 h-5" />
              <Sun v-else class="w-5 h-5" />
            </div>
            <span class="toolbar-item-label">{{ isNightMode ? '夜间' : '日间' }}</span>
          </button>

          <!-- 朗读 -->
          <button
            class="toolbar-item relative"
            @click="$emit('toggle-tts')"
          >
            <div class="toolbar-item-icon">
              <Pause v-if="tts.isSpeaking.value && !tts.isPaused.value" class="w-5 h-5" />
              <Play v-else-if="tts.isPaused.value" class="w-5 h-5" />
              <Volume2 v-else class="w-5 h-5" />
            </div>
            <span class="toolbar-item-label">{{ tts.isSpeaking.value ? '暂停' : '朗读' }}</span>
          </button>

          <!-- 设置 -->
          <button class="toolbar-item" @click="emit('toggle-settings')">
            <div class="toolbar-item-icon">
              <Type class="w-5 h-5" />
            </div>
            <span class="toolbar-item-label">设置</span>
          </button>

          <!-- 换源 (有问题时高亮) -->
          <button
            class="toolbar-item relative"
            :class="{ 'text-amber-500': readerStore.contentIssue }"
            @click="emit('toggle-source-picker')"
          >
            <div class="toolbar-item-icon">
              <ArrowLeftRight class="w-5 h-5" />
              <!-- 问题指示点 -->
              <span
                v-if="readerStore.contentIssue"
                class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full animate-pulse"
              />
            </div>
            <span class="toolbar-item-label">换源</span>
          </button>

          <!-- 刷新 -->
          <button class="toolbar-item" @click="emit('refresh')">
            <div class="toolbar-item-icon">
              <RotateCcw class="w-5 h-5" />
            </div>
            <span class="toolbar-item-label">刷新</span>
          </button>

          <!-- AI 助手 -->
          <button class="toolbar-item" @click="emit('toggle-ai-panel')">
            <div class="toolbar-item-icon">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span class="toolbar-item-label">AI</span>
          </button>
        </div>
      </div>
    </footer>
  </Transition>
</template>

<style scoped>
.toolbar-glass {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

:global(.dark) .toolbar-glass {
  background: rgba(0, 0, 0, 0.85);
  border-color: rgba(255, 255, 255, 0.1);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

.chapter-nav-btn {
  @apply flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all;
  @apply bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20;
}

.chapter-nav-btn.disabled {
  @apply opacity-40 cursor-not-allowed;
}

.toolbar-item {
  @apply flex flex-col items-center justify-center gap-1 py-3 px-2 transition-colors;
  @apply hover:bg-black/5 dark:hover:bg-white/10;
}

.toolbar-item-icon {
  @apply relative flex items-center justify-center;
}

.toolbar-item-label {
  @apply text-[10px] font-medium;
}

.progress-track {
  height: 3px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 1.5px;
  overflow: hidden;
  width: 100%;
}

:global(.dark) .progress-track {
  background: rgba(255, 255, 255, 0.1);
}

.progress-fill {
  height: 100%;
  background: currentColor;
  opacity: 0.3;
  border-radius: 1.5px;
  transition: width 0.3s ease;
}
</style>
