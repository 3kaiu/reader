<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NLayout,
  NLayoutSider,
  NLayoutContent,
  NButton,
  NSpace,
  NSpin,
  NSlider,
  NDrawer,
  NDrawerContent,
  NList,
  NListItem,
  NScrollbar,
  NResult,
  useMessage,
} from 'naive-ui'
import { useStorage, useDark, useToggle, onKeyStroke, useFullscreen } from '@vueuse/core'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import { bookApi, type Book } from '@/api'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const readerStore = useReaderStore()
const settingsStore = useSettingsStore()

// ====== 状态 ======
const showCatalog = ref(false)
const showSettings = ref(false)
const showToolbar = ref(true)

// 暗色模式
const isDark = useDark()
const toggleDark = useToggle(isDark)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()

// ====== 计算属性 ======
const contentStyle = computed(() => ({
  fontSize: `${settingsStore.fontSize}px`,
  lineHeight: settingsStore.lineHeight,
  fontFamily: settingsStore.fontFamily,
  maxWidth: `${settingsStore.pageWidth}px`,
}))

const readerThemeClass = computed(() => {
  const theme = settingsStore.readerTheme
  if (isDark.value) return 'reader-night'
  return `reader-${theme}`
})

const formattedContent = computed(() => {
  if (!readerStore.content) return ''
  
  // 段落格式化
  return readerStore.content
    .split('\n')
    .filter(p => p.trim())
    .map(p => `<p class="content-paragraph">${p.trim()}</p>`)
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
    // 获取书籍信息
    const res = await bookApi.getBookInfo(bookUrl)
    if (res.isSuccess) {
      await readerStore.openBook(res.data)
    } else {
      message.error(res.errorMsg || '获取书籍信息失败')
    }
  } catch (error) {
    message.error('加载书籍失败')
    console.error(error)
  }
}

// 返回书架
function goBack() {
  router.push('/')
}

// 切换工具栏显示
function toggleToolbar() {
  showToolbar.value = !showToolbar.value
}

// 跳转到指定章节
function goToChapter(index: number) {
  readerStore.goToChapter(index)
  showCatalog.value = false
}

// ==== 键盘快捷键 ====
onKeyStroke('ArrowLeft', () => readerStore.prevChapter())
onKeyStroke('ArrowRight', () => readerStore.nextChapter())
onKeyStroke('ArrowUp', () => readerStore.prevChapter())
onKeyStroke('ArrowDown', () => readerStore.nextChapter())
onKeyStroke('Escape', () => {
  if (showCatalog.value) {
    showCatalog.value = false
  } else if (showSettings.value) {
    showSettings.value = false
  } else {
    goBack()
  }
})
onKeyStroke('f', () => toggleFullscreen())
onKeyStroke('c', () => { showCatalog.value = !showCatalog.value })
onKeyStroke('s', () => { showSettings.value = !showSettings.value })

// 初始化
onMounted(() => {
  init()
})

onUnmounted(() => {
  readerStore.reset()
})
</script>

<template>
  <div 
    class="reader-container min-h-screen transition-colors duration-300"
    :class="readerThemeClass"
    @click="toggleToolbar"
  >
    <!-- 加载状态 -->
    <div v-if="readerStore.isLoading" class="fixed inset-0 flex items-center justify-center bg-black/20 z-50">
      <NSpin size="large" />
    </div>

    <!-- 错误状态 -->
    <div v-else-if="readerStore.error" class="min-h-screen flex items-center justify-center">
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
    <div v-else class="reader-content">
      <!-- 顶部工具栏 -->
      <Transition name="slide-down">
        <div 
          v-show="showToolbar"
          class="fixed top-0 left-0 right-0 h-14 glass flex items-center justify-between px-4 z-40"
          @click.stop
        >
          <NButton quaternary circle @click="goBack">
            <span class="text-xl">←</span>
          </NButton>

          <h1 class="text-base font-medium truncate max-w-md">
            {{ readerStore.currentBook?.name }}
          </h1>

          <NSpace>
            <NButton quaternary circle @click="showCatalog = true">
              <span class="text-lg">📑</span>
            </NButton>
            <NButton quaternary circle @click="showSettings = true">
              <span class="text-lg">⚙️</span>
            </NButton>
            <NButton quaternary circle @click="toggleFullscreen">
              <span class="text-lg">{{ isFullscreen ? '⛶' : '⛶' }}</span>
            </NButton>
          </NSpace>
        </div>
      </Transition>

      <!-- 章节标题 -->
      <div class="pt-20 pb-4 text-center">
        <h2 class="text-xl font-bold opacity-80">
          {{ readerStore.currentChapter?.title }}
        </h2>
      </div>

      <!-- 正文内容 -->
      <article
        class="mx-auto px-6 pb-32"
        :style="contentStyle"
        @click.stop
      >
        <div 
          class="prose prose-lg dark:prose-invert max-w-none"
          v-html="formattedContent"
        />
      </article>

      <!-- 底部工具栏 -->
      <Transition name="slide-up">
        <div 
          v-show="showToolbar"
          class="fixed bottom-0 left-0 right-0 glass px-4 py-3 z-40"
          @click.stop
        >
          <!-- 进度条 -->
          <div class="flex items-center gap-4 mb-3">
            <span class="text-xs opacity-60 w-16">
              {{ readerStore.currentChapterIndex + 1 }}/{{ readerStore.totalChapters }}
            </span>
            <NSlider
              :value="readerStore.currentChapterIndex + 1"
              :min="1"
              :max="readerStore.totalChapters"
              :step="1"
              :tooltip="false"
              @update:value="(v: number) => readerStore.goToChapter(v - 1)"
            />
            <span class="text-xs opacity-60 w-12 text-right">
              {{ readerStore.progress }}%
            </span>
          </div>

          <!-- 操作按钮 -->
          <div class="flex items-center justify-between">
            <NButton 
              :disabled="!readerStore.hasPrevChapter"
              @click="readerStore.prevChapter()"
            >
              上一章
            </NButton>

            <NSpace>
              <NButton quaternary @click="toggleDark()">
                {{ isDark ? '🌙' : '☀️' }}
              </NButton>
              <NButton quaternary @click="readerStore.refreshChapter()">
                🔄
              </NButton>
            </NSpace>

            <NButton 
              :disabled="!readerStore.hasNextChapter"
              @click="readerStore.nextChapter()"
            >
              下一章
            </NButton>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 目录抽屉 -->
    <NDrawer v-model:show="showCatalog" :width="320" placement="left">
      <NDrawerContent title="目录" closable>
        <NScrollbar style="max-height: calc(100vh - 80px)">
          <NList hoverable clickable>
            <NListItem
              v-for="(chapter, index) in readerStore.catalog"
              :key="index"
              :class="{ 'bg-primary-50 dark:bg-primary-900/20': index === readerStore.currentChapterIndex }"
              @click="goToChapter(index)"
            >
              <div class="flex items-center gap-2">
                <span 
                  class="w-10 text-xs opacity-50"
                >{{ index + 1 }}</span>
                <span 
                  class="truncate"
                  :class="{ 'text-primary font-medium': index === readerStore.currentChapterIndex }"
                >{{ chapter.title }}</span>
              </div>
            </NListItem>
          </NList>
        </NScrollbar>
      </NDrawerContent>
    </NDrawer>

    <!-- 设置抽屉 -->
    <NDrawer v-model:show="showSettings" :width="320" placement="right">
      <NDrawerContent title="阅读设置" closable>
        <div class="space-y-6">
          <!-- 字号 -->
          <div>
            <div class="text-sm font-medium mb-2">字号: {{ settingsStore.fontSize }}px</div>
            <NSlider 
              v-model:value="settingsStore.fontSize"
              :min="12"
              :max="32"
              :step="1"
            />
          </div>

          <!-- 行高 -->
          <div>
            <div class="text-sm font-medium mb-2">行高: {{ settingsStore.lineHeight }}</div>
            <NSlider 
              v-model:value="settingsStore.lineHeight"
              :min="1.2"
              :max="3"
              :step="0.1"
            />
          </div>

          <!-- 页面宽度 -->
          <div>
            <div class="text-sm font-medium mb-2">页宽: {{ settingsStore.pageWidth }}px</div>
            <NSlider 
              v-model:value="settingsStore.pageWidth"
              :min="400"
              :max="1200"
              :step="50"
            />
          </div>

          <!-- 阅读主题 -->
          <div>
            <div class="text-sm font-medium mb-2">阅读主题</div>
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="theme in ['light', 'paper', 'sepia', 'green']"
                :key="theme"
                class="w-10 h-10 rounded-lg border-2 transition-all"
                :class="[
                  `bg-reader-${theme}`,
                  settingsStore.readerTheme === theme ? 'border-primary scale-110' : 'border-transparent'
                ]"
                @click="settingsStore.setReaderTheme(theme as any)"
              />
              <button
                class="w-10 h-10 rounded-lg border-2 bg-reader-night transition-all"
                :class="settingsStore.readerTheme === 'dark' ? 'border-primary scale-110' : 'border-transparent'"
                @click="settingsStore.setReaderTheme('dark')"
              />
            </div>
          </div>
        </div>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
/* 阅读器主题 */
.reader-light {
  background: white;
  color: #1a1a1a;
}

.reader-paper {
  background: var(--color-reader-paper, #FBF9F3);
  color: #333;
}

.reader-sepia {
  background: var(--color-reader-sepia, #F4ECD8);
  color: #5b4636;
}

.reader-green {
  background: var(--color-reader-green, #E8F5E9);
  color: #2e5d32;
}

.reader-night {
  background: var(--color-reader-night, #121212);
  color: var(--color-reader-night-text, #B0B0B0);
}

/* 毛玻璃效果 */
.glass {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.reader-night .glass {
  background: rgba(18, 18, 18, 0.85);
  border-top-color: rgba(255, 255, 255, 0.05);
}

/* 段落样式 */
:deep(.content-paragraph) {
  text-indent: 2em;
  margin-bottom: 1em;
}

/* 过渡动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
