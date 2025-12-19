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
import { useFullscreen, onKeyStroke, useSwipe } from '@vueuse/core'
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
  if (settingsStore.isDark || settingsStore.config.theme === 'night') return 'theme-night'
  return `theme-${settingsStore.config.theme}`
})

const formattedContent = computed(() => {
  if (!readerStore.content) return ''
  return readerStore.content
    .split('\n')
    .filter(p => p.trim())
    .map(p => `<p class="content-paragraph" style="margin-bottom: ${settingsStore.config.paragraphSpacing}em">${p.trim()}</p>`)
    .join('')
})


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
function goToChapter(index: number) {
  readerStore.goToChapter(index)
  showCatalog.value = false
}

// 手势支持
const contentRef = ref<HTMLElement | null>(null)
const { direction } = useSwipe(contentRef)

watch(direction, (dir) => {
  if (dir === 'left') {
    readerStore.nextChapter()
  } else if (dir === 'right') {
    readerStore.prevChapter()
  }
})

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
      
      <!-- 章节标题 -->
      <div class="pt-24 pb-8 text-center">
        <h2 class="chapter-title text-xl font-bold opacity-80 inline-block">
          {{ readerStore.currentChapter?.title }}
        </h2>
      </div>
      
      <!-- 正文 -->
      <article
        class="mx-auto px-6 pb-40"
        :style="contentStyle"
        @click.stop
      >
        <div
          class="reader-text"
          v-html="formattedContent"
        />
      </article>
      
      <!-- 底部工具栏 -->
      <Transition name="slide-up">
        <footer
          v-show="showToolbar"
          class="fixed bottom-0 inset-x-0 z-40"
          @click.stop
        >
          <div class="toolbar-glass mx-3 mb-3 px-4 py-4 rounded-2xl shadow-lg">
            <!-- 进度信息 -->
            <div class="flex items-center justify-between mb-3 text-xs opacity-60">
              <span>第 {{ readerStore.currentChapterIndex + 1 }} 章</span>
              <span>{{ Math.round((readerStore.currentChapterIndex + 1) / readerStore.totalChapters * 100) }}%</span>
              <span>共 {{ readerStore.totalChapters }} 章</span>
            </div>
            
            <!-- 进度条 -->
            <div class="progress-bar mb-4">
              <div 
                class="progress-bar-fill" 
                :style="{ width: `${(readerStore.currentChapterIndex + 1) / readerStore.totalChapters * 100}%` }"
              />
            </div>
            
            <!-- 操作按钮 -->
            <div class="flex items-center justify-between">
              <!-- 上一章 -->
              <button
                :disabled="!readerStore.hasPrevChapter"
                class="px-4 py-2 rounded-full text-sm font-medium transition-all"
                :class="readerStore.hasPrevChapter ? 'bg-black/5 dark:bg-white/10 hover:bg-black/10' : 'opacity-30 cursor-not-allowed'"
                @click="readerStore.prevChapter()"
              >
                上一章
              </button>
              
              <!-- 中间功能按钮 -->
              <div class="flex items-center gap-4">
                <button class="reader-btn" @click="settingsStore.toggleDark()">
                  <span class="reader-btn-icon">{{ settingsStore.isDark ? '🌙' : '☀️' }}</span>
                  <span class="reader-btn-label">主题</span>
                </button>
                <button class="reader-btn" @click="showSourcePicker = true">
                  <span class="reader-btn-icon">🌐</span>
                  <span class="reader-btn-label">换源</span>
                </button>
                <button class="reader-btn" @click="showSettings = true">
                  <span class="reader-btn-icon">⚙️</span>
                  <span class="reader-btn-label">设置</span>
                </button>
                <button class="reader-btn" @click="readerStore.refreshChapter()">
                  <span class="reader-btn-icon">🔄</span>
                  <span class="reader-btn-label">刷新</span>
                </button>
              </div>
              
              <!-- 下一章 -->
              <button
                :disabled="!readerStore.hasNextChapter"
                class="px-4 py-2 rounded-full text-sm font-medium transition-all"
                :class="readerStore.hasNextChapter ? 'bg-black/5 dark:bg-white/10 hover:bg-black/10' : 'opacity-30 cursor-not-allowed'"
                @click="readerStore.nextChapter()"
              >
                下一章
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
  background: linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%);
  color: #1a1a1a;
}

/* 米黄护眼 */
.theme-paper {
  background: linear-gradient(180deg, #FDF8F0 0%, #F8F4EC 100%);
  color: #3d3d3d;
}

/* 羊皮纸 */
.theme-sepia {
  background: linear-gradient(180deg, #F4ECD8 0%, #EDE4D0 100%);
  color: #5B4636;
}

/* 护眼绿 */
.theme-green {
  background: linear-gradient(180deg, #E8F5E9 0%, #DCEDC8 100%);
  color: #2E5D32;
}

/* 深夜模式 */
.theme-night {
  background: linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%);
  color: #b8b8b8;
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
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.theme-night .toolbar-glass {
  background: rgba(30, 30, 30, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
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

/* ========== 阅读器按钮样式 ========== */
.reader-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 16px;
  border-radius: 12px;
  transition: all 0.2s ease;
  background: transparent;
  border: none;
  cursor: pointer;
}

.reader-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.theme-night .reader-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.reader-btn-icon {
  font-size: 20px;
  line-height: 1;
}

.reader-btn-label {
  font-size: 10px;
  opacity: 0.7;
}
</style>
