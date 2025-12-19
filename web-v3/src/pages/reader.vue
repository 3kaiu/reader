<script setup lang="ts">
/**
 * 阅读器页面 - 沉浸式设计
 * 全屏阅读 + 浮动工具栏 + 手势操作
 */
import { ref, computed, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NSpin,
  NResult,
  NButton,
  NSpace,
  useMessage,
} from 'naive-ui'
import { 
  Moon, Sun, ArrowLeftRight, Type, RotateCcw, Loader2,
  ChevronLeft, ChevronRight
} from 'lucide-vue-next'
import { useFullscreen, onKeyStroke, useSwipe, useScroll, useThrottleFn } from '@vueuse/core'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import { bookApi } from '@/api'

const ReadSettings = defineAsyncComponent(() => import('@/components/ReadSettings.vue'))
const BookSourcePicker = defineAsyncComponent(() => import('@/components/book/BookSourcePicker.vue'))
const BookInfoModal = defineAsyncComponent(() => import('@/components/book/BookInfoModal.vue'))
const ChapterList = defineAsyncComponent(() => import('@/components/book/ChapterList.vue'))

const router = useRouter()
const route = useRoute()
const message = useMessage()
const readerStore = useReaderStore()
const settingsStore = useSettingsStore()

// 全屏
const readerRef = ref<HTMLElement | null>(null)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(readerRef)

// ====== 状态 ======
const showToolbar = ref(false)
const showCatalog = ref(false)
const showSettings = ref(false)
const showSourcePicker = ref(false)
const showBookInfo = ref(false)
const hideToolbarTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// ====== 计算属性 ======
const contentStyle = computed(() => ({
  fontSize: `${settingsStore.config.fontSize}px`,
  lineHeight: settingsStore.config.lineHeight,
  maxWidth: `${settingsStore.config.pageWidth}px`,
  fontFamily: settingsStore.currentFontFamily,
  fontWeight: settingsStore.config.fontWeight,
}))

const themeClass = computed(() => {
  // 直接使用用户选择的阅读主题，不受系统暗色模式影响
  return `theme-${settingsStore.config.theme}`
})

// 是否为夜间模式
const isNightMode = computed(() => settingsStore.config.theme === 'night')

// 切换日夜模式
function toggleDayNight() {
  if (isNightMode.value) {
    // 夜间 -> 切换到白色主题
    settingsStore.updateConfig('theme', 'white')
  } else {
    // 日间 -> 切换到夜间主题
    settingsStore.updateConfig('theme', 'night')
  }
}

// 上一章处理函数
async function handlePrevChapter() {
  if (!readerStore.hasPrevChapter) return
  await readerStore.prevChapter()
  readerStore.initInfiniteScroll()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 下一章处理函数
async function handleNextChapter() {
  if (!readerStore.hasNextChapter) return
  await readerStore.nextChapter()
  readerStore.initInfiniteScroll()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 格式化章节内容
function formatContent(text: string): string {
  if (!text) return ''
  return text
    .split('\n')
    .filter((p: string) => p.trim())
    .map((p: string) => `<p class="content-paragraph" style="margin-bottom: ${settingsStore.config.paragraphSpacing}em">${p.trim()}</p>`)
    .join('')
}


// ====== 方法 ======

// 初始化
async function init() {
  const bookUrl = route.query.url as string
  if (!bookUrl) {
    message.error('缺少书籍信息')
    router.push('/')
    return
  }

  try {
    const res = await bookApi.getBookInfo(bookUrl)
    if (res.isSuccess) {
      await readerStore.openBook(res.data)
      // 初始化无限滚动模式
      readerStore.initInfiniteScroll()
    } else {
      message.error(res.errorMsg || '获取书籍信息失败')
    }
  } catch (error) {
    message.error('加载书籍失败')
  }
}

// 返回
function goBack() {
  router.push('/')
}

// 显示工具栏
function toggleToolbarVisible() {
  showToolbar.value = !showToolbar.value
  
  if (showToolbar.value) {
    startHideTimer()
  }
}

// 自动隐藏工具栏
function startHideTimer() {
  clearHideTimer()
  hideToolbarTimer.value = setTimeout(() => {
    if (!showSettings.value && !showCatalog.value) {
      showToolbar.value = false
    }
  }, 4000)
}

function clearHideTimer() {
  if (hideToolbarTimer.value) {
    clearTimeout(hideToolbarTimer.value)
    hideToolbarTimer.value = null
  }
}

// 跳转章节
async function goToChapter(index: number) {
  await readerStore.goToChapter(index)
  // 重新初始化无限滚动，显示新章节
  readerStore.initInfiniteScroll()
  showCatalog.value = false
  // 滚动到页面顶部
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 手势支持
const contentRef = ref<HTMLElement | null>(null)
const { direction } = useSwipe(contentRef)

watch(direction, (dir) => {
  if (dir === 'left') {
    readerStore.nextChapter()
    readerStore.initInfiniteScroll()
  } else if (dir === 'right') {
    readerStore.prevChapter()
    readerStore.initInfiniteScroll()
  }
})

// 无限滚动监听 - 监听整个页面滚动
const { arrivedState } = useScroll(window, { offset: { bottom: 500 } })

// 节流的加载更多函数
const loadMoreThrottled = useThrottleFn(async () => {
  if (readerStore.hasNextChapter && !readerStore.isLoadingMore) {
    await readerStore.appendNextChapter()
  }
}, 300)

watch(() => arrivedState.bottom, (isBottom) => {
  if (isBottom) {
    loadMoreThrottled()
  }
})

// 手动加载下一章
async function loadNextChapter() {
  if (readerStore.hasNextChapter && !readerStore.isLoadingMore) {
    await readerStore.appendNextChapter()
  }
}

// 键盘快捷键
onKeyStroke('ArrowLeft', () => readerStore.prevChapter())
onKeyStroke('ArrowRight', () => readerStore.nextChapter())
onKeyStroke('ArrowUp', () => readerStore.prevChapter())
onKeyStroke('ArrowDown', () => readerStore.nextChapter())
onKeyStroke('Escape', () => {
  if (showSettings.value) showSettings.value = false
  else if (showCatalog.value) showCatalog.value = false
  else if (showToolbar.value) showToolbar.value = false
  else goBack()
})
onKeyStroke('f', () => toggleFullscreen())
onKeyStroke('c', () => showCatalog.value = !showCatalog.value)
onKeyStroke('s', () => showSettings.value = !showSettings.value)
onKeyStroke('d', () => settingsStore.toggleDark())

// 生命周期
onMounted(() => {
  init()
})

onUnmounted(() => {
  clearHideTimer()
  readerStore.reset()
})
</script>

<template>
  <div
    ref="readerRef"
    class="reader-container min-h-screen transition-colors duration-500"
    :class="themeClass"
    @click="toggleToolbarVisible"
  >
    <!-- 加载状态 -->
    <div
      v-if="readerStore.isLoading"
      class="fixed inset-0 flex items-center justify-center z-50 bg-black/20"
    >
      <div class="text-center">
        <NSpin size="large" />
        <p class="mt-4 text-gray-500">加载中...</p>
      </div>
    </div>
    
    <!-- 错误状态 -->
    <div
      v-else-if="readerStore.error"
      class="min-h-screen flex items-center justify-center"
    >
      <NResult status="error" :title="readerStore.error">
        <template #footer>
          <NSpace>
            <NButton @click="readerStore.refreshChapter()">重试</NButton>
            <NButton type="primary" @click="goBack">返回书架</NButton>
          </NSpace>
        </template>
      </NResult>
    </div>
    
    <!-- 阅读内容 -->
    <div v-else ref="contentRef" class="reader-content">
      <!-- 顶部工具栏 -->
      <Transition name="slide-down">
        <header
          v-show="showToolbar"
          class="fixed top-0 inset-x-0 z-40"
          @click.stop
        >
          <div class="toolbar-glass mx-3 mt-3 px-4 py-3 rounded-2xl shadow-lg">
            <div class="flex items-center justify-between">
              <!-- 返回按钮 -->
              <button 
                class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                @click="goBack"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
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
                  @click="showCatalog = true"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </button>
                <button 
                  class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  @click="toggleFullscreen"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path v-if="!isFullscreen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4H4m0 0l5 5M9 20v-5H4m0 0l5-5m11 0l-5-5m5 0v5h-5m5 10l-5-5m5 0v5h-5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </header>
      </Transition>
      
      <!-- 章节标题 (只在第一章时显示) -->
      <div v-if="readerStore.loadedChapters.length === 0" class="pt-24 pb-8 text-center">
        <h2 class="chapter-title text-xl font-bold opacity-80 inline-block">
          {{ readerStore.currentChapter?.title }}
        </h2>
      </div>
      
      <!-- 正文 (无限滚动模式) -->
      <div 
        class="mx-auto px-6 pb-40 pt-20" 
        :style="contentStyle"
        @click.stop
      >
        <!-- 多章节内容 -->
        <template v-for="chapter in readerStore.loadedChapters" :key="chapter.index">
          <!-- 章节标题 -->
          <div class="text-center py-10 mt-10 first:mt-0">
            <div class="inline-block px-6 py-2 bg-primary/5 rounded-full mb-4">
              <span class="text-xs opacity-60">第 {{ chapter.index + 1 }} 章</span>
            </div>
            <h2 class="chapter-title text-xl font-bold opacity-90">
              {{ chapter.title }}
            </h2>
          </div>
          <!-- 章节内容 -->
          <article class="reader-text">
            <div v-html="formatContent(chapter.content)" />
          </article>
        </template>
        
        <!-- 加载更多指示器 -->
        <div v-if="readerStore.isLoadingMore" class="py-12 text-center">
          <Loader2 class="w-8 h-8 animate-spin mx-auto opacity-40" />
          <p class="text-sm opacity-40 mt-3">正在加载下一章...</p>
        </div>
        
        <!-- 已加载到末尾 -->
        <div v-else-if="!readerStore.hasNextChapter && readerStore.loadedChapters.length > 0" class="py-16 text-center">
          <div class="inline-block px-8 py-3 bg-muted/50 rounded-full">
            <p class="text-sm opacity-60">🎉 恭喜，已读完全书 🎉</p>
          </div>
        </div>
        
        <!-- 加载下一章按钮 -->
        <div v-else-if="readerStore.loadedChapters.length > 0" class="py-12 text-center">
          <button 
            class="px-6 py-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-full text-sm font-medium transition-colors"
            @click="loadNextChapter"
          >
            加载下一章
          </button>
          <p class="text-xs opacity-30 mt-3">或继续滚动自动加载</p>
        </div>
      </div>
      
      <!-- 底部工具栏 -->
      <Transition name="slide-up">
        <footer
          v-show="showToolbar"
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
                  @click="handlePrevChapter"
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
                    {{ Math.round((readerStore.currentChapterIndex + 1) / readerStore.totalChapters * 100) }}%
                  </div>
                </div>
                
                <!-- 下一章按钮 -->
                <button
                  :disabled="!readerStore.hasNextChapter"
                  class="chapter-nav-btn"
                  :class="{ 'disabled': !readerStore.hasNextChapter }"
                  @click="handleNextChapter"
                >
                  <span>下一章</span>
                  <ChevronRight class="w-4 h-4" />
                </button>
              </div>
              
              <!-- 进度条 -->
              <div class="progress-track mt-3">
                <div 
                  class="progress-fill" 
                  :style="{ width: `${(readerStore.currentChapterIndex + 1) / readerStore.totalChapters * 100}%` }"
                />
              </div>
            </div>
            
            <!-- 功能按钮区 -->
            <div class="grid grid-cols-4">
              <!-- 亮度/主题 -->
              <button class="toolbar-item" @click="toggleDayNight()">
                <div class="toolbar-item-icon">
                  <Moon v-if="isNightMode" class="w-5 h-5" />
                  <Sun v-else class="w-5 h-5" />
                </div>
                <span class="toolbar-item-label">{{ isNightMode ? '夜间' : '日间' }}</span>
              </button>
              
              <!-- 设置 -->
              <button class="toolbar-item" @click="showSettings = true">
                <div class="toolbar-item-icon">
                  <Type class="w-5 h-5" />
                </div>
                <span class="toolbar-item-label">设置</span>
              </button>
              
              <!-- 换源 -->
              <button class="toolbar-item" @click="showSourcePicker = true">
                <div class="toolbar-item-icon">
                  <ArrowLeftRight class="w-5 h-5" />
                </div>
                <span class="toolbar-item-label">换源</span>
              </button>
              
              <!-- 刷新 -->
              <button class="toolbar-item" @click="readerStore.refreshChapter()">
                <div class="toolbar-item-icon">
                  <RotateCcw class="w-5 h-5" />
                </div>
                <span class="toolbar-item-label">刷新</span>
              </button>
            </div>
          </div>
        </footer>
      </Transition>
    </div>
    
    <!-- 目录 -->
    <ChapterList 
      v-model:open="showCatalog"
      :chapters="readerStore.catalog"
      :current-ind="readerStore.currentChapterIndex"
      :book-name="readerStore.currentBook?.name"
      :loading="readerStore.isLoading"
      @select="goToChapter"
      @refresh="readerStore.refreshChapter()"
    />
    
    <!-- 设置抽屉 -->
    <ReadSettings v-model:open="showSettings" />
    
    <!-- 换源弹窗 -->
    <BookSourcePicker v-model:open="showSourcePicker" />
    
    <!-- 书籍详情 -->
    <BookInfoModal
      v-model:open="showBookInfo"
      :book-url="readerStore.currentBook?.bookUrl"
      :initial-book="readerStore.currentBook"
    />
  </div>
</template>

<style scoped>
/* ========== 阅读器主题 (参考微信读书) ========== */

/* 纯白主题 */
.theme-white {
  background: #FFFFFF;
  color: #242424;
}

/* 米黄护眼 (Warm Paper) */
.theme-paper {
  background: #FAF7ED;
  color: #38342F;
}

/* 羊皮纸 (Retro Sepia) */
.theme-sepia {
  background: #EFE6D5;
  color: #4A3B32;
}

/* 水墨灰 (E-ink Gray) */
.theme-gray {
  background: #F2F3F5;
  color: #2B2B2B;
}

/* 护眼绿 (Soft Green) */
.theme-green {
  background: #E6F0E6;
  color: #2E362C;
}

/* 深夜模式 (Optimized Dark) */
.theme-night {
  background: #1C1C1E;
  color: #A1A1AA;
}

/* ========== 正文排版样式 ========== */
.reader-text :deep(.content-paragraph) {
  text-indent: 2em;
  margin-bottom: 1.2em;
  word-break: break-word;
  letter-spacing: 0.02em;
  text-align: justify;
  transition: all 0.3s ease;
}

/* 章节标题样式 */
.chapter-title {
  position: relative;
  padding-bottom: 1rem;
}

.chapter-title::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 2px;
  background: linear-gradient(90deg, transparent, currentColor, transparent);
  opacity: 0.3;
}

/* ========== 工具栏样式 ========== */
.toolbar-glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.05);
}

.theme-night .toolbar-glass {
  background: rgba(28, 28, 30, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
}

/* ========== 进度条样式 ========== */
.progress-bar {
  height: 3px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 1.5px;
  overflow: hidden;
}

.theme-night .progress-bar {
  background: rgba(255, 255, 255, 0.1);
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #52c41a 0%, #73d13d 100%);
  border-radius: 1.5px;
  transition: width 0.3s ease;
}

/* ========== 工具栏动画 ========== */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

/* ========== 章节切换动画 ========== */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ========== 底部安全区 ========== */
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.safe-area-top {
  padding-top: env(safe-area-inset-top, 0);
}

/* ========== 阅读器工具栏样式 ========== */
.toolbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 4px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.toolbar-item::before {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 12px;
  background: transparent;
  transition: background 0.2s ease;
}

.toolbar-item:hover::before {
  background: rgba(0, 0, 0, 0.05);
}

.toolbar-item:active::before {
  background: rgba(0, 0, 0, 0.08);
}

.theme-night .toolbar-item:hover::before {
  background: rgba(255, 255, 255, 0.08);
}

.theme-night .toolbar-item:active::before {
  background: rgba(255, 255, 255, 0.12);
}

.toolbar-item-icon {
  position: relative;
  z-index: 1;
  transition: transform 0.2s ease;
}

.toolbar-item:active .toolbar-item-icon {
  transform: scale(0.92);
}

.toolbar-item-label {
  font-size: 10px;
  opacity: 0.6;
  position: relative;
  z-index: 1;
  font-weight: 500;
}

/* ========== 章节导航按钮 ========== */
.chapter-nav-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 20px;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.15);
  color: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
}

.chapter-nav-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.3);
  transform: translateY(-1px);
}

.chapter-nav-btn:active:not(:disabled) {
  transform: translateY(0);
}

.chapter-nav-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
  border-color: rgba(0, 0, 0, 0.1);
}

.theme-night .chapter-nav-btn {
  border-color: rgba(255, 255, 255, 0.2);
}

.theme-night .chapter-nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
}

/* ========== 简化版进度条 ========== */
.progress-track {
  height: 3px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 1.5px;
  overflow: hidden;
  width: 100%;
}

.theme-night .progress-track {
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
