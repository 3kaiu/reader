<script setup lang="ts">
/**
 * 阅读器页面 - 沉浸式设计
 * 全屏阅读 + 浮动工具栏 + 手势操作
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NSlider,
  NDrawer,
  NDrawerContent,
  NScrollbar,
  NSpin,
  NResult,
  NButton,
  NSpace,
  useMessage,
} from 'naive-ui'
import { useDark, useToggle, useFullscreen, onKeyStroke, useSwipe, useStorage } from '@vueuse/core'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import { bookApi } from '@/api'
import { GlassCard, FloatingButton } from '@/components/ui'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const readerStore = useReaderStore()
const settingsStore = useSettingsStore()

// 暗色模式
const isDark = useDark()
const toggleDark = useToggle(isDark)

// 全屏
const readerRef = ref<HTMLElement | null>(null)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(readerRef)

// ====== 状态 ======
const showToolbar = ref(false)
const showCatalog = ref(false)
const showSettings = ref(false)
const hideToolbarTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// 阅读设置
const fontSize = useStorage('reader-font-size', 18)
const lineHeight = useStorage('reader-line-height', 1.8)
const pageWidth = useStorage('reader-page-width', 800)
const readerTheme = useStorage<'white' | 'paper' | 'sepia' | 'green' | 'night'>('reader-theme', 'paper')

// ====== 计算属性 ======
const contentStyle = computed(() => ({
  fontSize: `${fontSize.value}px`,
  lineHeight: lineHeight.value,
  maxWidth: `${pageWidth.value}px`,
}))

const themeClass = computed(() => {
  if (isDark.value || readerTheme.value === 'night') return 'theme-night'
  return `theme-${readerTheme.value}`
})

const formattedContent = computed(() => {
  if (!readerStore.content) return ''
  return readerStore.content
    .split('\n')
    .filter(p => p.trim())
    .map(p => `<p class="content-paragraph">${p.trim()}</p>`)
    .join('')
})

const themes = [
  { key: 'white', label: '白', color: '#FFFFFF' },
  { key: 'paper', label: '纸', color: '#FBF9F3' },
  { key: 'sepia', label: '羊皮', color: '#F4ECD8' },
  { key: 'green', label: '护眼', color: '#E8F5E9' },
  { key: 'night', label: '夜间', color: '#121212' },
]

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
onKeyStroke('d', () => toggleDark())

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
          class="fixed top-0 inset-x-0 z-40 safe-area-top"
          @click.stop
        >
          <div class="glass dark:glass-dark mx-4 mt-4 px-4 py-3 rounded-2xl shadow-lg">
            <div class="flex items-center justify-between">
              <FloatingButton
                icon="←"
                variant="ghost"
                size="sm"
                @click="goBack"
              />
              
              <div class="flex-1 text-center px-4">
                <h1 class="font-medium text-gray-800 dark:text-white truncate">
                  {{ readerStore.currentBook?.name }}
                </h1>
                <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {{ readerStore.currentChapter?.title }}
                </p>
              </div>
              
              <NSpace :size="8">
                <FloatingButton
                  icon="📑"
                  variant="ghost"
                  size="sm"
                  tooltip="目录"
                  @click="showCatalog = true"
                />
                <FloatingButton
                  :icon="isFullscreen ? '⛶' : '⛶'"
                  variant="ghost"
                  size="sm"
                  tooltip="全屏"
                  @click="toggleFullscreen"
                />
              </NSpace>
            </div>
          </div>
        </header>
      </Transition>
      
      <!-- 章节标题 -->
      <div class="pt-24 pb-6 text-center">
        <h2 class="text-xl font-bold opacity-80">
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
          class="fixed bottom-0 inset-x-0 z-40 safe-area-bottom"
          @click.stop
        >
          <div class="glass dark:glass-dark mx-4 mb-4 px-4 py-4 rounded-2xl shadow-lg">
            <!-- 进度条 -->
            <div class="flex items-center gap-4 mb-4">
              <span class="text-xs text-gray-500 w-12">
                {{ readerStore.currentChapterIndex + 1 }}
              </span>
              <NSlider
                :value="readerStore.currentChapterIndex + 1"
                :min="1"
                :max="readerStore.totalChapters"
                :step="1"
                :tooltip="false"
                @update:value="(v: number) => readerStore.goToChapter(v - 1)"
              />
              <span class="text-xs text-gray-500 w-12 text-right">
                {{ readerStore.totalChapters }}
              </span>
            </div>
            
            <!-- 操作按钮 -->
            <div class="flex items-center justify-between">
              <NButton
                :disabled="!readerStore.hasPrevChapter"
                round
                @click="readerStore.prevChapter()"
              >
                ← 上一章
              </NButton>
              
              <NSpace :size="12">
                <FloatingButton
                  :icon="isDark ? '🌙' : '☀️'"
                  variant="ghost"
                  size="md"
                  tooltip="主题"
                  @click="toggleDark()"
                />
                <FloatingButton
                  icon="⚙️"
                  variant="ghost"
                  size="md"
                  tooltip="设置"
                  @click="showSettings = true"
                />
                <FloatingButton
                  icon="🔄"
                  variant="ghost"
                  size="md"
                  tooltip="刷新"
                  @click="readerStore.refreshChapter()"
                />
              </NSpace>
              
              <NButton
                :disabled="!readerStore.hasNextChapter"
                round
                @click="readerStore.nextChapter()"
              >
                下一章 →
              </NButton>
            </div>
          </div>
        </footer>
      </Transition>
    </div>
    
    <!-- 目录抽屉 -->
    <NDrawer v-model:show="showCatalog" :width="320" placement="left">
      <NDrawerContent title="目录" closable>
        <NScrollbar style="max-height: calc(100vh - 80px)">
          <div class="space-y-1">
            <div
              v-for="(chapter, index) in readerStore.catalog"
              :key="index"
              class="px-4 py-3 rounded-xl cursor-pointer transition-all
                     hover:bg-blue-50 dark:hover:bg-blue-900/20"
              :class="{
                'bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30': 
                  index === readerStore.currentChapterIndex
              }"
              @click="goToChapter(index)"
            >
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-400 w-8">{{ index + 1 }}</span>
                <span 
                  class="truncate"
                  :class="{
                    'text-[#4361EE] dark:text-blue-400 font-medium': 
                      index === readerStore.currentChapterIndex
                  }"
                >
                  {{ chapter.title }}
                </span>
              </div>
            </div>
          </div>
        </NScrollbar>
      </NDrawerContent>
    </NDrawer>
    
    <!-- 设置抽屉 -->
    <NDrawer v-model:show="showSettings" :width="360" placement="right">
      <NDrawerContent title="阅读设置" closable>
        <div class="space-y-8">
          <!-- 字号 -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="font-medium">字号</span>
              <span class="text-sm text-gray-500">{{ fontSize }}px</span>
            </div>
            <div class="flex items-center gap-4">
              <button
                class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 
                       flex items-center justify-center text-lg
                       hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                @click="fontSize = Math.max(12, fontSize - 1)"
              >
                A-
              </button>
              <NSlider
                v-model:value="fontSize"
                :min="12"
                :max="32"
                :step="1"
                class="flex-1"
              />
              <button
                class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 
                       flex items-center justify-center text-lg
                       hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                @click="fontSize = Math.min(32, fontSize + 1)"
              >
                A+
              </button>
            </div>
          </div>
          
          <!-- 行距 -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="font-medium">行距</span>
              <span class="text-sm text-gray-500">{{ lineHeight.toFixed(1) }}</span>
            </div>
            <NSlider
              v-model:value="lineHeight"
              :min="1.2"
              :max="3"
              :step="0.1"
            />
          </div>
          
          <!-- 页宽 -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="font-medium">页面宽度</span>
              <span class="text-sm text-gray-500">{{ pageWidth }}px</span>
            </div>
            <NSlider
              v-model:value="pageWidth"
              :min="400"
              :max="1200"
              :step="50"
            />
          </div>
          
          <!-- 主题 -->
          <div>
            <div class="font-medium mb-3">阅读主题</div>
            <div class="flex gap-3">
              <button
                v-for="theme in themes"
                :key="theme.key"
                class="w-12 h-12 rounded-xl border-2 transition-all
                       hover:scale-110"
                :class="readerTheme === theme.key 
                  ? 'border-[#4361EE] scale-110 shadow-lg' 
                  : 'border-gray-200 dark:border-gray-700'"
                :style="{ backgroundColor: theme.color }"
                @click="readerTheme = theme.key as any"
              >
                <span v-if="theme.key === 'night'" class="text-white text-xs">🌙</span>
              </button>
            </div>
          </div>
          
          <!-- 快捷键提示 -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div class="font-medium mb-3">快捷键</div>
            <div class="grid grid-cols-2 gap-2 text-sm text-gray-500">
              <div>← → 翻页</div>
              <div>C 目录</div>
              <div>S 设置</div>
              <div>F 全屏</div>
              <div>D 夜间模式</div>
              <div>Esc 返回</div>
            </div>
          </div>
        </div>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
/* 阅读器主题 */
.theme-white {
  background: #FFFFFF;
  color: #1a1a1a;
}

.theme-paper {
  background: #FBF9F3;
  color: #333333;
}

.theme-sepia {
  background: #F4ECD8;
  color: #5B4636;
}

.theme-green {
  background: #E8F5E9;
  color: #2E5D32;
}

.theme-night {
  background: #121212;
  color: #C4C4C4;
}

/* 内容样式 */
.reader-text :deep(.content-paragraph) {
  text-indent: 2em;
  margin-bottom: 1.2em;
  word-break: break-word;
}

/* 工具栏动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
