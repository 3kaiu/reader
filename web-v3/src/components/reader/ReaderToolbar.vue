<script setup lang="ts">
/**
 * 阅读器顶部工具栏组件
 */
import { computed } from 'vue'
import { ArrowLeft, Settings, List, Moon, Sun } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useReaderStore } from '@/stores/reader'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'go-back': []
  'toggle-settings': []
  'toggle-catalog': []
  'toggle-night-mode': []
  'toggle-fullscreen': []
}>()

const settingsStore = useSettingsStore()
const readerStore = useReaderStore()

const isNightMode = computed(() => settingsStore.config.theme === 'night')
</script>

<template>
  <Transition name="slide-down">
    <header
      v-show="show"
      class="fixed top-0 inset-x-0 z-40"
      @click.stop
    >
      <div class="toolbar-glass mx-3 mt-3 px-4 py-3 rounded-2xl shadow-lg">
        <div class="flex items-center justify-between">
          <!-- 返回按钮 -->
          <button 
            class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            @click="emit('go-back')"
          >
            <ArrowLeft class="w-5 h-5" />
          </button>
          
          <!-- 书名和章节 -->
          <div class="flex-1 text-center px-3">
            <h1 class="font-semibold text-sm truncate">
              {{ readerStore.currentBook?.name }}
            </h1>
            <p class="text-xs opacity-60 truncate mt-0.5">
              {{ readerStore.currentChapter?.title }}
            </p>
          </div>
          
          <!-- 右侧按钮 -->
          <div class="flex items-center gap-1">
            <button
              class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              @click="emit('toggle-catalog')"
              title="目录"
            >
              <List class="w-5 h-5" />
            </button>
            
            <button
              class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              @click="emit('toggle-fullscreen')"
              title="全屏"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
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

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-100%);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
