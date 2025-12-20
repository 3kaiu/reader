<script setup lang="ts">
/**
 * 阅读器页面 - 沉浸式设计
 * 全屏阅读 + 浮动工具栏 + 手势操作
 */
import { ref, computed, onMounted, onUnmounted, onBeforeUnmount, watch, defineAsyncComponent, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NSpin,
  useMessage,
} from 'naive-ui'
import { 
  Moon, Sun, ArrowLeftRight, Type, RotateCcw, Loader2,
  ChevronLeft, ChevronRight, Volume2, Pause, Play, X
} from 'lucide-vue-next'
import { useFullscreen, onKeyStroke, useSwipe, useScroll, useThrottleFn, useResizeObserver, useDateFormat, useNow } from '@vueuse/core'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import { bookApi } from '@/api'
import { useTTS } from '@/composables/useTTS'

const ReadSettings = defineAsyncComponent(() => import('@/components/ReadSettings.vue'))
const BookSourcePicker = defineAsyncComponent(() => import('@/components/book/BookSourcePicker.vue'))
const BookInfoModal = defineAsyncComponent(() => import('@/components/book/BookInfoModal.vue'))
const ChapterList = defineAsyncComponent(() => import('@/components/book/ChapterList.vue'))
const AIPanel = defineAsyncComponent(() => import('@/components/AIPanel.vue'))

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
const showTTSPanel = ref(false)
const showAIPanel = ref(false)
const hideToolbarTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// TTS 语音朗读
const tts = useTTS()

// 时钟
const formattedTime = useDateFormat(useNow(), 'HH:mm')


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

// 翻页动画样式
const pageTransition = computed(() => {
  const animation = settingsStore.config.pageAnimation
  switch (animation) {
    case 'slide':
      return 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
    case 'fade':
      return 'opacity 0.3s ease-in-out'
    case 'none':
      return 'none'
    default:
      return 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
  }
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

// 刷新章节并恢复滚动位置
async function handleRefresh() {
  const scrollRatio = await readerStore.refreshChapter()
  // 等待 DOM 更新后恢复滚动
  await nextTick()
  setTimeout(() => {
    const newScrollHeight = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: scrollRatio * newScrollHeight, behavior: 'instant' })
  }, 100)
}

// TTS 朗读当前章节
// TTS 相关状态
const currentTTSParagraphIndex = ref(-1)

// 获取页面上的所有段落元素
function getParagraphs() {
  return Array.from(document.querySelectorAll('.reader-text .content-paragraph')) as HTMLElement[]
}

// 高亮当前段落并滚动
function highlightCurrentParagraph() {
  const paragraphs = getParagraphs()
  // 清除所有高亮
  paragraphs.forEach((p, idx) => {
    if (idx === currentTTSParagraphIndex.value) {
      p.classList.add('tts-active')
      
      // 根据模式处理滚动/翻页
      if (settingsStore.config.readingMode === 'swipe') {
        // Swipe 模式：计算段落所在页并跳转
        // 段落的 offsetLeft 是相对于 swipeContentRef 的
        // 每一页的宽度是 swipeContentRef.clientWidth (即 100vw)
        const container = swipeContentRef.value
        if (container) {
          const pageWidth = container.clientWidth
          // 计算该段落中心点所在的页码
          const pCenter = p.offsetLeft + (p.clientWidth / 2)
          const targetPage = Math.floor(pCenter / pageWidth)
          
          if (targetPage >= 0 && targetPage < swipeTotalPages.value && targetPage !== swipePage.value) {
            swipePage.value = targetPage
          }
        }
      } else {
        // Scroll 模式：滚动到视图中心
        p.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else {
      p.classList.remove('tts-active')
    }
  })
}

// 播放下一段
function playNextParagraph() {
  if (!showTTSPanel.value) return // 面板关闭则停止

  const paragraphs = getParagraphs()
  if (paragraphs.length === 0) return

  // 如果这是第一次播放
  if (currentTTSParagraphIndex.value === -1) {
    if (settingsStore.config.readingMode === 'swipe') {
      // Swipe 模式：找到当前页的第一个段落
      // 只要段落在视口内 (rect.left >= 0 && rect.right <= windowWidth)
      // 但由于 transform，我们需要找 offsetLeft 对应的段落
      const container = swipeContentRef.value
      if (container) {
        const pageWidth = container.clientWidth
        const currentScrollX = swipePage.value * pageWidth
        
        // 找到第一个 offsetLeft 大于等于当前页起始位置的段落
        const firstVisibleIndex = paragraphs.findIndex(p => {
           return p.offsetLeft + p.clientWidth > currentScrollX
        })
        currentTTSParagraphIndex.value = firstVisibleIndex >= 0 ? firstVisibleIndex : 0
      } else {
        currentTTSParagraphIndex.value = 0
      }
    } else {
      // Scroll 模式：找到第一个在视口内的段落
      const headerHeight = 60
      const firstVisibleIndex = paragraphs.findIndex(p => {
        const rect = p.getBoundingClientRect()
        return rect.top >= headerHeight
      })
      currentTTSParagraphIndex.value = firstVisibleIndex >= 0 ? firstVisibleIndex : 0
    }
  } else {
    // 播放下一段
    currentTTSParagraphIndex.value++
  }

  // 检查是否超出范围
  if (currentTTSParagraphIndex.value >= paragraphs.length) {
    // 本章读完，尝试自动翻页（可选）
    // 目前简单停止
    stopTTS()
    message.success('本章朗读结束')
    return
  }

  // 获取文本并朗读
  const p = paragraphs[currentTTSParagraphIndex.value]
  const text = p.textContent || p.innerText
  
  if (!text.trim()) {
    // 跳过空段落
    playNextParagraph()
    return
  }

  highlightCurrentParagraph()
  
  // 朗读，结束后继续下一段
  tts.speak(text, () => {
    playNextParagraph()
  })
  
  showTTSPanel.value = true
}

// TTS 朗读控制
function startTTS() {
  if (!tts.isSupported.value) {
    message.warning('您的浏览器不支持语音朗读')
    return
  }
  
  // 必须先显示面板，否则 playNextParagraph 会被拦截
  showTTSPanel.value = true
  
  if (currentTTSParagraphIndex.value === -1) {
    // 开始新朗读
    playNextParagraph()
  } else {
    // 继续当前段落
    // 重新获取段落（以防 DOM 变化或重新进入）
    const paragraphs = getParagraphs()
    if (currentTTSParagraphIndex.value < paragraphs.length) {
      const p = paragraphs[currentTTSParagraphIndex.value]
      const text = p.textContent || p.innerText
      highlightCurrentParagraph()
      tts.speak(text, () => playNextParagraph())
    } else {
      // 索引无效，重新开始
      currentTTSParagraphIndex.value = -1
      playNextParagraph()
    }
  }
}

// 切换 TTS 播放/暂停
function toggleTTS() {
  if (tts.isSpeaking.value) {
    tts.pause()
  } else if (tts.isPaused.value) {
    tts.resume()
  } else {
    startTTS()
  }
}



// 停止 TTS
function stopTTS() {
  tts.stop()
  showTTSPanel.value = false
  // 清除高亮
  const paragraphs = getParagraphs()
  paragraphs.forEach(p => p.classList.remove('tts-active'))
  // 不重置 index，允许用户重新打开面板继续朗读？
  // 或者重置 index? 通常停止意味着重置。暂停才是保持。
  // 但是如果用户只是关闭了面板，可能希望下次继续。
  // 这里我们保持 index，除非用户翻页了。
}

// 监听翻页，重置 TTS
watch(() => readerStore.currentChapterIndex, () => {
  if (showTTSPanel.value) {
    stopTTS()
    currentTTSParagraphIndex.value = -1
  } else {
    currentTTSParagraphIndex.value = -1
  }
})

// 切换工具栏显示
function toggleToolbar() {
  showToolbar.value = !showToolbar.value
  
  if (showToolbar.value) {
    startHideTimer()
  }
}

// ====== Swipe Mode Logic ======
const swipeContentRef = ref<HTMLElement | null>(null)
const swipePage = ref(0)
const swipeTotalPages = ref(1)
const swipeLayout = ref({
  columnWidth: 0,
  columnGap: 0,
  padding: 0
})

// 初始化/更新翻页模式
async function initSwipeMode() {
  if (settingsStore.config.readingMode !== 'swipe') return
  
  await nextTick()
  if (!swipeContentRef.value) return
  
  const el = swipeContentRef.value
  const windowWidth = el.clientWidth
  
  // 计算布局：通过 column-width 和 column-gap 控制页面宽度和居中
  // 使用 pageWidth 配置，主要限制最大宽度，最小留白 24px
  const maxContentWidth = Math.min(settingsStore.config.pageWidth, windowWidth - 48)
  
  // 设置布局参数
  swipeLayout.value.columnWidth = maxContentWidth
  // 间距设为视口剩余空间，这样下一列就会准确地出现在下一个视口的相同位置
  swipeLayout.value.columnGap = windowWidth - maxContentWidth
  // 左右内边距设为剩余空间的一半，实现居中
  swipeLayout.value.padding = (windowWidth - maxContentWidth) / 2
  
  // 等待样式应用
  await nextTick()
  
  // 计算总页数
  const total = Math.ceil(el.scrollWidth / el.clientWidth)
  swipeTotalPages.value = Math.max(1, total)
  
  // 确保页码不越界
  if (swipePage.value >= swipeTotalPages.value) {
    swipePage.value = Math.max(0, swipeTotalPages.value - 1)
  }
}

// 处理点击翻页
function handleSwipeClick(e: MouseEvent) {
  // 如果是滚动模式，点击任意位置切换工具栏
  if (settingsStore.config.readingMode === 'scroll') {
    toggleToolbar()
    return
  }

  const width = window.innerWidth
  const x = e.clientX
  
  // 点击中间 30% 区域切换工具栏
  if (x > width * 0.35 && x < width * 0.65) {
    toggleToolbar()
    return
  }
  
  // 点击左侧上一页，右侧下一页
  if (x <= width * 0.35) {
    prevPage()
  } else {
    nextPage()
  }
}

// 下一页
async function nextPage() {
  if (swipePage.value < swipeTotalPages.value - 1) {
    swipePage.value++
  } else {
    // 最后一页，跳转下一章
    if (readerStore.hasNextChapter) {
      await readerStore.nextChapter()
      swipePage.value = 0
      // 等待内容渲染后更新页数
      setTimeout(initSwipeMode, 100)
    } else {
      message.success('已读完最后一章')
    }
  }
}

// 上一页
async function prevPage() {
  if (swipePage.value > 0) {
    swipePage.value--
  } else {
    // 第一页，跳转上一章
    if (readerStore.hasPrevChapter) {
      await readerStore.prevChapter()
      // 等待内容渲染，跳到最后一页
      setTimeout(async () => {
        await initSwipeMode()
        swipePage.value = Math.max(0, swipeTotalPages.value - 1)
      }, 100)
    } else {
      message.success('已经是第一章')
    }
  }
}

// 监听模式切换和章节变化
watch(
  [() => settingsStore.config.readingMode, () => readerStore.currentChapterIndex],
  () => {
    if (settingsStore.config.readingMode === 'swipe') {
      initSwipeMode()
    }
  }
)

// 监听窗口大小变化
useResizeObserver(swipeContentRef, useThrottleFn(() => {
  requestAnimationFrame(() => initSwipeMode())
}, 200))

// ====== 方法 ======

// 初始化
async function init() {
  const bookUrl = route.query.url as string
  if (!bookUrl) {
    message.error('缺少书籍信息')
    router.push('/')
    return
  }

  // 应用自动夜间模式
  settingsStore.applyAutoNightMode()

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

// 滚动时更新当前章节索引 (使用 Intersection Observer)
let chapterObserver: IntersectionObserver | null = null

function setupChapterObserver() {
  if (settingsStore.config.readingMode !== 'scroll') return
  
  // 清理旧的 observer
  if (chapterObserver) {
    chapterObserver.disconnect()
  }
  
  // 创建新的 observer
  // rootMargin: 当章节标题进入视口顶部 100px 位置时触发
  chapterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const chapterIndex = parseInt(entry.target.getAttribute('data-chapter-index') || '0')
        
        // 当章节标题离开视口顶部（向上滚动时）
        if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
          // 进入该章节
          if (chapterIndex !== readerStore.currentChapterIndex) {
            readerStore.setCurrentChapterIndex(chapterIndex)
          }
        }
        // 当章节标题进入视口（向下滚动回来时）
        else if (entry.isIntersecting && entry.boundingClientRect.top > 0) {
          // 如果是第一章之后的章节标题进入视口，说明我们回到了上一章
          if (chapterIndex > 0 && chapterIndex <= readerStore.currentChapterIndex) {
            readerStore.setCurrentChapterIndex(chapterIndex - 1)
          }
        }
      })
    },
    {
      rootMargin: '-100px 0px 0px 0px', // 视口顶部 100px 作为触发线
      threshold: 0
    }
  )
  
  // 观察所有章节标题
  nextTick(() => {
    const markers = document.querySelectorAll('.chapter-marker[data-chapter-index]')
    markers.forEach((marker) => {
      chapterObserver?.observe(marker)
    })
  })
}

// 监听模式切换和章节列表变化，重新设置 observer
watch(
  [() => settingsStore.config.readingMode, () => readerStore.loadedChapters.length],
  () => {
    if (settingsStore.config.readingMode === 'scroll') {
      setupChapterObserver()
    } else if (chapterObserver) {
      chapterObserver.disconnect()
      chapterObserver = null
    }
  },
  { immediate: true }
)

// 手动加载下一章
async function loadNextChapter() {
  if (readerStore.hasNextChapter && !readerStore.isLoadingMore) {
    await readerStore.appendNextChapter()
  }
}

// 键盘快捷键
// 键盘快捷键
function handleKeyNav(direction: 'prev' | 'next') {
  if (settingsStore.config.readingMode === 'swipe') {
    direction === 'prev' ? prevPage() : nextPage()
  } else {
    direction === 'prev' ? readerStore.prevChapter() : readerStore.nextChapter()
  }
}

onKeyStroke(['ArrowLeft', 'ArrowUp'], (e) => {
  e.preventDefault()
  handleKeyNav('prev')
})
onKeyStroke(['ArrowRight', 'ArrowDown', ' '], (e) => {
  e.preventDefault()
  handleKeyNav('next')
})
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
onKeyStroke('a', () => showAIPanel.value = !showAIPanel.value) // AI 助手

// 页面卸载前保存进度
function handleBeforeUnload() {
  readerStore.saveProgress()
}

// 生命周期
onMounted(() => {
  init()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  // 组件卸载前保存进度
  readerStore.saveProgress()
})

onUnmounted(() => {
  clearHideTimer()
  window.removeEventListener('beforeunload', handleBeforeUnload)
  readerStore.reset()
})
</script>

<template>
  <div
    ref="readerRef"
    class="reader-container min-h-screen transition-colors duration-500"
    :class="[
      themeClass,
      { 
        'select-none': settingsStore.config.readingMode === 'swipe',
        'h-screen overflow-y-auto': isFullscreen
      }
    ]"
    :style="settingsStore.config.theme === 'custom' && settingsStore.config.customColors ? {
      '--custom-bg': settingsStore.config.customColors.background,
      '--custom-text': settingsStore.config.customColors.text,
      backgroundColor: settingsStore.config.customColors.background,
      color: settingsStore.config.customColors.text
    } : undefined"
    @click="handleSwipeClick"
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
    
    <!-- 错误状态 (使用阅读主题样式) -->
    <div
      v-else-if="readerStore.error"
      class="min-h-screen flex items-center justify-center p-6"
      :class="themeClass"
    >
      <div class="text-center max-w-sm">
        <!-- 错误图标 - 使用主题色 -->
        <div class="w-20 h-20 rounded-full bg-current/10 flex items-center justify-center mx-auto mb-6">
          <svg class="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <!-- 错误信息 -->
        <h2 class="text-lg font-semibold mb-2 opacity-90">加载失败</h2>
        <p class="text-sm mb-6 opacity-60">{{ readerStore.error }}</p>
        
        <!-- 操作按钮 - 使用协调的颜色 -->
        <div class="flex flex-col gap-3">
          <button 
            class="w-full py-3 px-6 rounded-xl bg-current/10 hover:bg-current/20 font-medium transition-colors flex items-center justify-center gap-2"
            @click="showSourcePicker = true"
          >
            <ArrowLeftRight class="w-4 h-4" />
            尝试换一个书源
          </button>
          <div class="flex gap-3">
            <button 
              class="flex-1 py-2.5 px-4 rounded-xl bg-current/5 hover:bg-current/10 text-sm transition-colors flex items-center justify-center gap-1"
              @click="handleRefresh()"
            >
              <RotateCcw class="w-4 h-4" />
              重试
            </button>
            <button 
              class="flex-1 py-2.5 px-4 rounded-xl bg-current/5 hover:bg-current/10 text-sm transition-colors"
              @click="goBack"
            >
              返回书架
            </button>
          </div>
        </div>
      </div>
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
      
      <!-- 内容问题警告横幅 -->
      <Transition name="slide-down">
        <div 
          v-if="readerStore.contentIssue && !showToolbar" 
          class="fixed top-0 inset-x-0 z-30"
        >
          <div class="mx-3 mt-3 px-4 py-3 rounded-2xl bg-amber-500/95 dark:bg-amber-600/95 text-white shadow-lg backdrop-blur">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 min-w-0">
                <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span class="text-sm font-medium truncate">{{ readerStore.contentIssue }}</span>
              </div>
              <button 
                class="shrink-0 px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5"
                @click="showSourcePicker = true"
              >
                <ArrowLeftRight class="w-3.5 h-3.5" />
                换源
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 章节标题 (只在第一章时显示) -->
      <div v-if="readerStore.loadedChapters.length === 0" class="pt-24 pb-8 text-center">
        <h2 class="chapter-title text-xl font-bold opacity-80 inline-block">
          {{ readerStore.currentChapter?.title }}
        </h2>
      </div>
      
      <!-- 正文 (无限滚动模式) -->
      <div 
        v-if="settingsStore.config.readingMode === 'scroll'"
        class="mx-auto px-6 pb-40 pt-20" 
        :style="contentStyle"
      >
        <!-- 多章节内容 -->
        <template v-for="chapter in readerStore.loadedChapters" :key="chapter.index">
          <!-- 章节标题 -->
          <div 
            class="chapter-marker text-center py-10 mt-10 first:mt-0"
            :data-chapter-index="chapter.index"
          >
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
          <div class="inline-block px-8 py-3 bg-current/5 rounded-full">
            <p class="text-sm opacity-60">🎉 恭喜，已读完全书 🎉</p>
          </div>
        </div>
        
        <!-- 加载下一章按钮 -->
        <div v-else-if="readerStore.loadedChapters.length > 0" class="py-12 text-center">
          <button 
            class="px-6 py-3 bg-current/10 hover:bg-current/15 rounded-full text-sm font-medium transition-colors"
            @click="loadNextChapter"
          >
            加载下一章
          </button>
          <p class="text-xs opacity-30 mt-3">或继续滚动自动加载</p>
        </div>
      </div>
      
      <!-- 正文 (左右翻页模式) -->
      <div 
        v-else
        class="fixed inset-0 z-0 overflow-hidden"
        :style="{
          ...contentStyle,
          maxWidth: 'none',
          height: '100vh',
          width: '100vw'
        }"
      >
        <div 
          ref="swipeContentRef"
          class="h-full w-full py-8"
          :style="{
            columnWidth: `${swipeLayout.columnWidth}px`,
            columnGap: `${swipeLayout.columnGap}px`,
            paddingLeft: `${swipeLayout.padding}px`,
            paddingRight: `${swipeLayout.padding}px`,
            height: '100vh',
            transform: settingsStore.config.pageAnimation !== 'fade' 
              ? `translateX(-${swipePage * 100}vw)` 
              : 'none',
            opacity: settingsStore.config.pageAnimation === 'fade' ? 1 : undefined,
            transition: pageTransition
          }"
        >
          <!-- 章节标题 -->
          <div class="text-center pb-8 pt-4">
             <div class="inline-block px-4 py-1 bg-primary/5 rounded-full mb-2">
               <span class="text-xs opacity-60">第 {{ readerStore.currentChapterIndex + 1 }} 章</span>
             </div>
             <h2 class="chapter-title text-xl font-bold opacity-90 mb-0">
               {{ readerStore.currentChapter?.title || readerStore.currentBook?.durChapterTitle }}
             </h2>
          </div>
          <!-- 章节内容 -->
          <article class="reader-text text-justify">
            <div v-html="formatContent(readerStore.content)" />
          </article>
          
          <!-- 本章结束提示 -->
          <div class="h-40 flex flex-col items-center justify-center text-center opacity-60 break-inside-avoid">
             <div class="divider mb-2">❦</div>
             <p class="text-xs">本章完</p>
          </div>
        </div>
        
        <!-- 页码指示器 -->
        <div class="fixed bottom-3 right-6 text-xs opacity-40 font-mono pointer-events-none z-10 transition-opacity duration-300" :class="{ 'opacity-0': showToolbar }">
          {{ swipePage + 1 }} / {{ swipeTotalPages }}
        </div>
      </div>

      <!-- 全屏时钟 -->
      <div v-if="isFullscreen" class="fixed top-4 right-6 text-xs opacity-30 font-mono pointer-events-none z-50">
        {{ formattedTime }}
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
            <div class="grid grid-cols-6">
              <!-- 亮度/主题 -->
              <button class="toolbar-item" @click="toggleDayNight()">
                <div class="toolbar-item-icon">
                  <Moon v-if="isNightMode" class="w-5 h-5" />
                  <Sun v-else class="w-5 h-5" />
                </div>
                <span class="toolbar-item-label">{{ isNightMode ? '夜间' : '日间' }}</span>
              </button>
              
              <!-- 朗读 -->
              <button 
                class="toolbar-item relative" 
                @click="toggleTTS()"
              >
                <div class="toolbar-item-icon">
                  <Pause v-if="tts.isSpeaking.value && !tts.isPaused.value" class="w-5 h-5" />
                  <Play v-else-if="tts.isPaused.value" class="w-5 h-5" />
                  <Volume2 v-else class="w-5 h-5" />
                </div>
                <span class="toolbar-item-label">{{ tts.isSpeaking.value ? '暂停' : '朗读' }}</span>
              </button>
              
              <!-- 设置 -->
              <button class="toolbar-item" @click="showSettings = true">
                <div class="toolbar-item-icon">
                  <Type class="w-5 h-5" />
                </div>
                <span class="toolbar-item-label">设置</span>
              </button>
              
              <!-- 换源 (有问题时高亮) -->
              <button 
                class="toolbar-item relative" 
                :class="{ 'text-amber-500': readerStore.contentIssue }"
                @click="showSourcePicker = true"
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
              <button class="toolbar-item" @click="handleRefresh()">
                <div class="toolbar-item-icon">
                  <RotateCcw class="w-5 h-5" />
                </div>
                <span class="toolbar-item-label">刷新</span>
              </button>
              
              <!-- AI 助手 -->
              <button class="toolbar-item" @click="showAIPanel = true">
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
      
      <!-- TTS 控制面板 -->
      <Transition name="slide-up">
        <div 
          v-if="showTTSPanel && (tts.isSpeaking.value || tts.isPaused.value)"
          class="fixed bottom-20 inset-x-0 z-30 flex justify-center"
          @click.stop
        >
          <div class="tts-panel toolbar-glass mx-3 px-4 py-3 rounded-2xl shadow-lg w-full max-w-screen-md">
            <div class="flex items-center gap-4">
              <!-- 播放/暂停按钮 -->
              <button 
                class="tts-play-btn w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                @click="tts.toggle()"
              >
                <Pause v-if="tts.isSpeaking.value && !tts.isPaused.value" class="w-5 h-5" />
                <Play v-else class="w-5 h-5" />
              </button>
              
              <!-- 进度信息 -->
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">正在朗读</div>
                <div class="text-xs opacity-60 truncate">{{ readerStore.currentChapter?.title }}</div>
              </div>
              
              <!-- 语速调节 -->
              <div class="hidden sm:flex items-center gap-2 text-xs shrink-0">
                <span class="opacity-60">语速</span>
                <button 
                  class="tts-rate-btn px-2 py-1 rounded"
                  :class="{ 'active': tts.rate.value === 0.75 }"
                  @click="tts.setRate(0.75)"
                >慢</button>
                <button 
                  class="tts-rate-btn px-2 py-1 rounded"
                  :class="{ 'active': tts.rate.value === 1 }"
                  @click="tts.setRate(1)"
                >中</button>
                <button 
                  class="tts-rate-btn px-2 py-1 rounded"
                  :class="{ 'active': tts.rate.value === 1.5 }"
                  @click="tts.setRate(1.5)"
                >快</button>
              </div>
              
              <!-- 停止按钮 -->
              <button 
                class="w-8 h-8 rounded-full hover:opacity-70 flex items-center justify-center shrink-0 opacity-60"
                @click="stopTTS()"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
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
      @refresh="handleRefresh()"
      :is-cached="readerStore.isChapterCached"
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
    
    <!-- AI 助手面板 -->
    <AIPanel v-model:open="showAIPanel" />
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

/* 自定义主题 - 颜色通过内联样式动态设置 */
.theme-custom {
  /* 使用 CSS 变量回退，实际颜色由内联样式覆盖 */
  background: var(--custom-bg, #FAF7ED);
  color: var(--custom-text, #333333);
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

/* ========== TTS 面板样式 ========== */
.tts-play-btn {
  background: currentColor;
  color: inherit;
  opacity: 0.9;
}

.tts-play-btn:hover {
  opacity: 1;
}

/* 使用反色文字 */
.theme-white .tts-play-btn,
.theme-paper .tts-play-btn,
.theme-sepia .tts-play-btn,
.theme-gray .tts-play-btn,
.theme-green .tts-play-btn {
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
}

.theme-night .tts-play-btn {
  background: rgba(255, 255, 255, 0.9);
  color: #1C1C1E;
}

.tts-rate-btn {
  background: rgba(0, 0, 0, 0.08);
  transition: all 0.2s ease;
}

.tts-rate-btn:hover {
  background: rgba(0, 0, 0, 0.12);
}

.tts-rate-btn.active {
  background: rgba(0, 0, 0, 0.2);
  font-weight: 600;
}

.theme-night .tts-rate-btn {
  background: rgba(255, 255, 255, 0.1);
}

.theme-night .tts-rate-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.theme-night .tts-rate-btn.active {
  background: rgba(255, 255, 255, 0.25);
}

/* TTS 高亮当前段落 */
.reader-text :deep(.content-paragraph.tts-active) {
  background-color: rgba(255, 204, 0, 0.2);
  border-radius: 4px;
  box-shadow: 0 0 0 4px rgba(255, 204, 0, 0.2);
}

.theme-night .reader-text :deep(.content-paragraph.tts-active) {
  background-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.15);
}
</style>
