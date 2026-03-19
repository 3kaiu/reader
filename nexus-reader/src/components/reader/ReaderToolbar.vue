<script setup lang="ts">
/**
 * 阅读器工具栏组件
 * 包含顶部标题栏和底部功能导航栏
 */
import { 
  ArrowLeft, List, Moon, Sun, RotateCcw,
  ArrowLeftRight, Type, Eye, Sparkles, X,
  Settings, BookOpen, Loader2
} from 'lucide-vue-next'
import ReaderNavigation from './ReaderNavigation.vue'
import ReaderProgress from './ReaderProgress.vue'

interface Props {
  show: boolean
  zenMode: boolean
  bookName?: string
  chapterTitle?: string
  currentChapterIndex: number
  totalChapters: number
  hasPrevChapter: boolean
  hasNextChapter: boolean
  isNightMode: boolean
  isFullscreen: boolean
  isEyeCareEnabled: boolean
  contentIssue?: string | null
  // 解密相关
  showDecoderAction?: boolean
  isDecoderEnabled?: boolean
  isDecoding?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  back: []
  toggleCatalog: []
  toggleSettings: []
  toggleDayNight: []
  toggleFullscreen: []
  toggleEyeCare: []
  toggleZenMode: []
  refresh: []
  prevChapter: []
  nextChapter: []
  openSourcePicker: []
  openBookInfo: []
  // 解密相关
  toggleDecoder: [enabled: boolean]
  openDecoderSettings: []
}>()
</script>

<template>
  <div>
    <!-- 顶部工具栏 -->
    <Transition name="slide-down">
      <header
        v-show="show && !zenMode"
        class="fixed top-0 inset-x-0 z-40"
        @click.stop
      >
        <div class="toolbar-glass mx-3 mt-3 px-5 py-3 rounded-2xl shadow-premium border border-white/10">
          <div class="flex items-center justify-between">
            <!-- 返回按钮 -->
            <button 
              class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              @click="emit('back')"
            >
              <ArrowLeft class="w-5 h-5" />
            </button>
            
            <!-- 书名和章节 -->
            <div class="flex-1 text-center px-3">
              <h1 class="font-semibold text-sm truncate">
                {{ bookName }}
              </h1>
              <p class="text-xs opacity-60 truncate mt-0.5">
                {{ chapterTitle }}
              </p>
            </div>
            
            <!-- 右侧按钮 -->
            <div class="flex items-center gap-1">
              <button 
                class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                @click="emit('toggleCatalog')"
              >
                <List class="w-5 h-5" />
              </button>
              <button 
                class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                @click="emit('toggleFullscreen')"
              >
                <svg v-if="!isFullscreen" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4H4m0 0l5 5M9 20v-5H4m0 0l5-5m11 0l-5-5m5 0v5h-5m5 10l-5-5m5 0v5h-5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>
    </Transition>

    <!-- 禅模式极简退出按钮 -->
    <Transition name="fade">
      <div 
        v-if="zenMode" 
        class="fixed top-6 right-6 z-50 animate-in fade-in duration-700"
      >
        <button 
          class="w-10 h-10 rounded-full bg-background/20 hover:bg-background/40 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all hover:scale-110 active:scale-90"
          title="退出禅模式"
          @click="emit('toggleZenMode')"
        >
          <X class="w-5 h-5 text-foreground/40 hover:text-foreground/80" />
        </button>
      </div>
    </Transition>

    <!-- 底部工具栏 -->
    <Transition name="slide-up">
      <footer
        v-show="show && !zenMode"
        class="fixed bottom-0 inset-x-0 z-40"
        @click.stop
      >
        <div class="toolbar-glass mx-3 mb-3 rounded-2xl shadow-premium overflow-hidden border border-white/10">
          <!-- 进度区域 -->
          <div class="px-5 pt-5 pb-4">
            <ReaderNavigation
              :current-chapter-index="currentChapterIndex"
              :total-chapters="totalChapters"
              :has-prev-chapter="hasPrevChapter"
              :has-next-chapter="hasNextChapter"
              @prev="emit('prevChapter')"
              @next="emit('nextChapter')"
            />
            
            <div class="mt-4">
              <ReaderProgress :progress="(currentChapterIndex + 1) / (totalChapters || 1) * 100" />
            </div>
          </div>
          
          <!-- 功能按钮区 -->
          <div class="grid grid-cols-6 grid-rows-2 sm:flex sm:flex-wrap sm:justify-evenly sm:grid-cols-none pb-2">
            <button class="toolbar-item group" @click="emit('toggleDayNight')">
              <div class="toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform">
                <Moon v-if="isNightMode" class="w-5 h-5" />
                <Sun v-else class="w-5 h-5" />
              </div>
              <span class="toolbar-item-label">{{ isNightMode ? '夜间' : '日间' }}</span>
            </button>
            
            <button class="toolbar-item group" @click="emit('toggleSettings')">
              <div class="toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform">
                <Type class="w-5 h-5" />
              </div>
              <span class="toolbar-item-label">设置</span>
            </button>
            
            <button 
              class="toolbar-item group relative" 
              :class="{ 'text-amber-500': contentIssue }"
              @click="emit('openSourcePicker')"
            >
              <div class="toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform">
                <ArrowLeftRight class="w-5 h-5" />
                <span v-if="contentIssue" class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              </div>
              <span class="toolbar-item-label">书源</span>
            </button>
            
            <button class="toolbar-item group" @click="emit('refresh')">
              <div class="toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform">
                <RotateCcw class="w-5 h-5" />
              </div>
              <span class="toolbar-item-label">刷新</span>
            </button>
            
            <button 
              class="toolbar-item group"
              :class="{ 'text-green-500': isEyeCareEnabled }"
              @click="emit('toggleEyeCare')"
            >
              <div class="toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform">
                <Eye class="w-5 h-5" />
              </div>
              <span class="toolbar-item-label">{{ isEyeCareEnabled ? '护眼开' : '护眼' }}</span>
            </button>
            
            <!-- 解密按钮 -->
            <button 
              v-if="showDecoderAction"
              class="toolbar-item group relative"
              :class="{ 'text-purple-500': isDecoderEnabled }"
              @click="emit('toggleDecoder', !isDecoderEnabled)"
              @contextmenu.prevent="emit('openDecoderSettings')"
            >
              <div class="toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform">
                <Loader2 v-if="isDecoding" class="w-5 h-5 animate-spin" />
                <Sparkles v-else class="w-5 h-5" />
              </div>
              <span class="toolbar-item-label">{{ isDecoderEnabled ? '解密中' : '解密' }}</span>
              <span
                v-if="isDecoderEnabled && !isDecoding"
                class="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse"
              />
            </button>

            <button class="toolbar-item group" @click="emit('toggleZenMode')">
              <div class="toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform">
                <Settings class="w-5 h-5 text-primary" />
              </div>
              <span class="toolbar-item-label">禅模式</span>
            </button>

            <button class="toolbar-item group" @click="emit('openBookInfo')">
              <div class="toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform">
                <BookOpen class="w-5 h-5" />
              </div>
              <span class="toolbar-item-label">详情</span>
            </button>
          </div>
        </div>
      </footer>
    </Transition>
  </div>
</template>

<style scoped>
.toolbar-glass {
  background: rgba(var(--background-rgb), 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(var(--foreground-rgb), 0.1);
}

.toolbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 0;
  gap: 0.25rem;
  transition: all 0.2s;
  border-radius: 0.5rem;
}

.toolbar-item:active {
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

.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-20px);
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
