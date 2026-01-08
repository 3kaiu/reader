<script setup lang="ts">
/**
 * 阅读器页面 - 沉浸式设计 [Refactored v4.0]
 * 已拆分为多个子组件：ReaderToolbar, ReaderContent, ReaderTTS, ReaderModals, ReaderKeyboard, ReaderGesture
 */
import { ref, computed, onMounted, onUnmounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from '@/components/ui/toast/use-toast'
import { X, Loader2, Sparkles } from 'lucide-vue-next'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import { bookApi } from '@/api'
import { useFullscreen, useThrottleFn, useDateFormat, useNow, useScroll } from '@vueuse/core'
import { useTTS } from '@/composables/useTTS'
import { useOfflineStore } from '@/stores/offlineStorage'
import { useSwipeMode } from '@/composables/useSwipeMode'
import { useTTSReader } from '@/composables/useTTSReader'
import { useEyeCare } from '@/composables/useEyeCare'
import { useAIInsightsStore } from '@/stores/aiInsights'
import { useAIStore } from '@/stores/ai'
import { useEngagementTracker } from '@/composables/useEngagementTracker'

// 组件导入
import ReaderToolbar from '@/components/reader/ReaderToolbar.vue'
import ReaderContent from '@/components/reader/ReaderContent.vue'
import ReaderTTS from '@/components/reader/ReaderTTS.vue'
import ReaderModals from '@/components/reader/ReaderModals.vue'
import ReaderKeyboard from '@/components/reader/ReaderKeyboard.vue'
import ReaderGesture from '@/components/reader/ReaderGesture.vue'
import { KEYBOARD_SHORTCUTS, MOOD_COLORS } from '@/constants/reader'
import ParagraphSelectionMenu from '@/components/ParagraphSelectionMenu.vue'
import BreakReminder from '@/components/BreakReminder.vue'
import SmartRecap from '@/components/reader/SmartRecap.vue'

const router = useRouter()
const route = useRoute()
const { toast } = useToast()
const readerStore = useReaderStore()
const settingsStore = useSettingsStore()
const offlineStore = useOfflineStore()
const insightsStore = useAIInsightsStore()
const aiStore = useAIStore()
const tts = useTTS()
const eyeCare = useEyeCare()

// ====== 状态与全屏 ======
const readerRef = ref<HTMLElement | null>(null)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(readerRef)

const showToolbar = ref(false)
const showCatalog = ref(false)
const showSettings = ref(false)
const showSourcePicker = ref(false)
const showBookInfo = ref(false)
const showTTSPanel = ref(false)
const showAIPanel = ref(false)
const showInsightsPanel = ref(false)
const showKeyboardHelp = ref(false)
const showVoiceSettings = ref(false)
const showSmartRecap = ref(false)
const recapChapters = ref<Array<{ title: string, content: string }>>([])
const hideToolbarTimer = ref<ReturnType<typeof setTimeout> | null>(null)


// ====== 综合样式计算 ======
const contentStyle = computed(() => ({
  fontSize: `${settingsStore.config.fontSize}px`,
  lineHeight: settingsStore.config.lineHeight,
  fontWeight: settingsStore.config.fontWeight,
  fontFamily: settingsStore.currentFontFamily,
  color: settingsStore.themeColors.text,
  maxWidth: `${settingsStore.config.pageWidth}px`,
  '--custom-bg': settingsStore.themeColors.bg,
  '--custom-text': settingsStore.themeColors.text
}))

// ====== 工具方法 ======
function toggleToolbar() {
  if (settingsStore.config.zenMode) return
  showToolbar.value = !showToolbar.value
  if (showToolbar.value) startHideTimer()
}

function toggleZenMode() {
  const newState = !settingsStore.config.zenMode
  settingsStore.updateConfig('zenMode', newState)
  if (newState) {
    showToolbar.value = showSettings.value = showCatalog.value = false
    toast({ title: '已进入禅模式', description: '所有界面已隐藏，双击中央区域退出', duration: 3000 })
  } else {
    toast({ title: '已退出禅模式', duration: 2000 })
  }
}

const isNightMode = computed(() => settingsStore.config.theme === 'night')
function toggleDayNight() {
  settingsStore.updateConfig('theme', isNightMode.value ? 'white' : 'night')
}

// ====== Composables 初始化 ======
const {
  contentRef: swipeContentRef,
  page: swipePage,
  totalPages: swipeTotalPages,
  layout: swipeLayout,
  handleClick: handleSwipeClick,
  nextPage,
  prevPage,
} = useSwipeMode({ readerStore, settingsStore, toggleToolbar, toast })

const {
  currentParagraphIndex: currentTTSParagraphIndex,
  isSpeaking: ttsIsSpeaking,
  isPaused: ttsIsPaused,
  start: startTTS,
  stop: stopTTS,
  toggle: toggleTTS,
  sleepTimerRemaining,
  setSleepTimer,
  cancelSleepTimer,
  formatSleepTimerRemaining,
} = useTTSReader({ readerStore, settingsStore, swipeContentRef, swipePage, swipeTotalPages, showTTSPanel, toast })

const { startTracking, stopTracking } = useEngagementTracker(route.query.url as string, readerStore.currentChapterIndex)

// ====== 导航逻辑 ======
async function handlePrevChapter() {
  if (settingsStore.config.readingMode === 'swipe') return prevPage()
  if (!readerStore.hasPrevChapter) return
  await readerStore.prevChapter(); readerStore.initInfiniteScroll(); window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function handleNextChapter() {
  if (settingsStore.config.readingMode === 'swipe') return nextPage()
  if (!readerStore.hasNextChapter) return
  await readerStore.nextChapter(); readerStore.initInfiniteScroll(); window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function handleRefresh() {
  const scrollRatio = await readerStore.refreshChapter()
  await nextTick()
  setTimeout(() => {
    const newScrollHeight = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: scrollRatio * newScrollHeight, behavior: 'instant' })
  }, 100)
}

function goBack() { router.push('/') }

// ====== 自动控制 ======
function startHideTimer() {
  clearHideTimer()
  hideToolbarTimer.value = setTimeout(() => { if (!showSettings.value && !showCatalog.value) showToolbar.value = false }, 4000)
}
function clearHideTimer() { if (hideToolbarTimer.value) { clearTimeout(hideToolbarTimer.value); hideToolbarTimer.value = null } }

// ====== 观察者与监听 ======
const { arrivedState } = useScroll(window, { offset: { bottom: 500 } })
watch(() => arrivedState.bottom, (isBottom) => {
  if (isBottom && settingsStore.config.readingMode === 'scroll' && readerStore.hasNextChapter && !readerStore.isLoadingMore) {
    readerStore.appendNextChapter()
  }
})

watch(() => readerStore.content, (newContent) => {
  const chapter = readerStore.currentChapter
  if (newContent && chapter && readerStore.currentBook) {
    insightsStore.analyzeChapter(
      readerStore.currentBook.bookUrl, 
      readerStore.currentChapterIndex, 
      newContent, 
      chapter.title
    )
  }
})

// ====== 生命周期 ======
onMounted(() => {
  initReader()
  offlineStore.loadCacheIndex()
  window.addEventListener('beforeunload', () => readerStore.saveProgress())
  nextTick(() => { if (selectionContainerRef.value) startTracking(selectionContainerRef.value) })
})

onBeforeUnmount(() => { if (selectionContainerRef.value) stopTracking(selectionContainerRef.value); readerStore.saveProgress() })
onUnmounted(() => { clearHideTimer(); readerStore.reset() })

async function initReader() {
  const { url: bookUrl, source: sourceId } = route.query
  if (!bookUrl || !sourceId) { toast({ title: '缺少书籍信息', variant: 'destructive' }); router.push('/'); return }
  settingsStore.applyAutoNightMode()
  try {
    const res = await bookApi.getBookInfo(sourceId as string, bookUrl as string)
    if (res.isSuccess) {
      await readerStore.openBook({ ...res.data, sourceId: sourceId as string, bookUrl: bookUrl as string })
      readerStore.initInfiniteScroll()
      
      // 检测是否需要显示剧情回顾 (如果阅读超过 2 章)
      if (readerStore.currentChapterIndex > 1) {
        const prevIndices = [readerStore.currentChapterIndex - 2, readerStore.currentChapterIndex - 1]
        const chapters: any[] = []
        for (const idx of prevIndices) {
          if (idx < 0) continue
          const chapter = readerStore.catalog[idx]
          const contentRes = await bookApi.getBookContent(sourceId as string, chapter.url)
          if (contentRes.isSuccess) {
            chapters.push({ title: chapter.title, content: contentRes.data.content })
          }
        }
        if (chapters.length > 0) {
          recapChapters.value = chapters
          showSmartRecap.value = true
        }
      }
    } else { toast({ title: res.errorMsg || '获取书籍信息失败', variant: 'destructive' }) }
  } catch (error) { toast({ title: '加载书籍失败', variant: 'destructive' }) }
}

const contentRef = ref<any>(null)
const selectionContainerRef = computed(() => settingsStore.config.readingMode === 'swipe' ? contentRef.value?.swipeContentRef : contentRef.value?.$el?.querySelector('.reader-text'))
const formattedTime = useDateFormat(useNow(), 'HH:mm')

</script>

<template>
  <div
    ref="readerRef"
    class="reader-container min-h-screen transition-colors duration-500 relative"
    :class="[ `theme-${settingsStore.config.theme}`, { 'overflow-hidden': settingsStore.config.readingMode === 'swipe' }]"
    :style="settingsStore.config.theme === 'custom' && settingsStore.config.customColors ? {
      backgroundColor: settingsStore.config.customColors.background,
      color: settingsStore.config.customColors.text,
    } : {}"
  >
    <!-- 键盘控制与手势 -->
    <ReaderKeyboard
      :reading-mode="settingsStore.config.readingMode"
      @prev="handlePrevChapter"
      @next="handleNextChapter"
      @toggle-fullscreen="toggleFullscreen"
      @toggle-catalog="showCatalog = !showCatalog"
      @toggle-settings="showSettings = !showSettings"
      @toggle-day-night="toggleDayNight"
      @toggle-zen-mode="toggleZenMode"
      @toggle-ai-panel="showAIPanel = !showAIPanel"
      @toggle-insights="showInsightsPanel = !showInsightsPanel"
      @toggle-help="showKeyboardHelp = !showKeyboardHelp"
      @escape="showToolbar = showSettings = showCatalog = false; if(!showToolbar && !showSettings && !showCatalog) goBack()"
    />

    <ReaderGesture
      :reading-mode="settingsStore.config.readingMode"
      :zen-mode="settingsStore.config.zenMode"
      @toggle-toolbar="toggleToolbar"
      @toggle-zen-mode="toggleZenMode"
      @prev="handlePrevChapter"
      @next="handleNextChapter"
    >
      <!-- 加载状态 -->
      <div v-if="readerStore.isLoading" class="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md">
        <div class="flex flex-col items-center gap-6">
          <Loader2 class="w-16 h-16 text-primary/10 animate-spin" />
          <p class="text-xs font-medium tracking-widest text-primary/40 uppercase">Loading Content</p>
        </div>
      </div>
      
      <!-- 错误状态 -->
      <div v-else-if="readerStore.error" class="min-h-screen flex items-center justify-center p-6 z-40 relative">
        <div class="text-center max-w-sm">
          <h2 class="text-lg font-semibold mb-2">加载失败</h2>
          <p class="text-sm mb-6 opacity-60">{{ readerStore.error }}</p>
          <button class="w-full py-3 px-6 rounded-xl bg-primary/10 hover:bg-primary/20" @click="showSourcePicker = true">换个书源</button>
        </div>
      </div>

      <!-- 核心功能组件 -->
      <template v-else>
        <ReaderToolbar
          :show="showToolbar"
          :zen-mode="settingsStore.config.zenMode"
          :book-name="readerStore.currentBook?.name"
          :chapter-title="readerStore.currentChapter?.title"
          :current-chapter-index="readerStore.currentChapterIndex"
          :total-chapters="readerStore.totalChapters"
          :has-prev-chapter="readerStore.hasPrevChapter"
          :has-next-chapter="readerStore.hasNextChapter"
          :is-night-mode="isNightMode"
          :is-fullscreen="isFullscreen"
          :is-tts-speaking="ttsIsSpeaking"
          :is-tts-paused="ttsIsPaused"
          :is-eye-care-enabled="eyeCare.config.value.enabled"
          @back="goBack"
          @toggle-catalog="showCatalog = true"
          @toggle-fullscreen="toggleFullscreen"
          @toggle-day-night="toggleDayNight"
          @toggle-tts="toggleTTS"
          @toggle-settings="showSettings = true"
          @toggle-ai="showAIPanel = true"
          @toggle-insights="showInsightsPanel = true"
          @toggle-eye-care="eyeCare.config.value.enabled ? eyeCare.disable() : eyeCare.enable()"
          @toggle-zen-mode="toggleZenMode"
          @refresh="readerStore.reloadCurrentChapter"
          @prev-chapter="handlePrevChapter"
          @next-chapter="handleNextChapter"
          @open-source-picker="showSourcePicker = true"
        />

        <ReaderContent
          ref="contentRef"
          :reading-mode="settingsStore.config.readingMode"
          :content-style="contentStyle"
          :loaded-chapters="readerStore.loadedChapters"
          :is-loading-more="readerStore.isLoadingMore"
          :current-chapter-index="readerStore.currentChapterIndex"
          :swipe-page="swipePage"
          :swipe-total-pages="swipeTotalPages"
          :swipe-layout="swipeLayout"
          :formatted-time="formattedTime"
          :paragraph-spacing="settingsStore.config.paragraphSpacing"
          :formatted-content="readerStore.formattedContent"
          :is-parsing="readerStore.isParsing"
          :has-next-chapter="readerStore.hasNextChapter"
          @load-next-chapter="readerStore.appendNextChapter"
        />

        <ReaderTTS
          :show="showTTSPanel"
          :is-speaking="ttsIsSpeaking"
          :is-paused="ttsIsPaused"
          :current-rate="tts.rate.value"
          :sleep-timer-remaining="sleepTimerRemaining"
          :formatted-remaining-time="formatSleepTimerRemaining()"
          @toggle="toggleTTS"
          @set-rate="tts.setRate"
          @set-timer="setSleepTimer"
          @cancel-timer="cancelSleepTimer"
          @stop="stopTTS"
          @open-voice-settings="showVoiceSettings = true"
        />

        <ReaderModals
          v-model:show-catalog="showCatalog"
          v-model:show-settings="showSettings"
          v-model:show-source-picker="showSourcePicker"
          v-model:show-book-info="showBookInfo"
          v-model:show-a-i-panel="showAIPanel"
          v-model:show-insights-panel="showInsightsPanel"
          v-model:show-keyboard-help="showKeyboardHelp"
          v-model:show-voice-settings="showVoiceSettings"
          :book="readerStore.currentBook"
          :chapters="readerStore.catalog"
          :current-ind="readerStore.currentChapterIndex"
          :catalog-loading="readerStore.isLoading"
          :keyboard-shortcuts="KEYBOARD_SHORTCUTS" 
          @select-chapter="(idx) => readerStore.goToChapter(idx)"
          @refresh-catalog="readerStore.refreshChapter"
        />

        <ParagraphSelectionMenu :container-ref="selectionContainerRef" />
        <BreakReminder v-if="eyeCare.showBreakReminder.value" :reading-time="eyeCare.formatReadingTime()" @dismiss="eyeCare.dismissBreakReminder()" />
        
        <!-- 剧情回顾 -->
        <SmartRecap 
          v-if="showSmartRecap" 
          :book-title="readerStore.currentBook?.name"
          :last-chapters="recapChapters"
          @close="showSmartRecap = false"
        />
      </template>
    </ReaderGesture>
  </div>
</template>

<style scoped>
/* 核心排版样式保留 */
.reader-container { font-family: sans-serif; }
.theme-white { background: #FFFFFF; color: #242424; }
.theme-paper { background: #FAF7ED; color: #38342F; }
.theme-sepia { background: #EFE6D5; color: #4A3B32; }
.theme-gray { background: #F2F3F5; color: #2B2B2B; }
.theme-green { background: #E6F0E6; color: #2E362C; }
.theme-night { background: #1C1C1E; color: #A1A1AA; }
.theme-custom { background: var(--custom-bg); color: var(--custom-text); }

</style>

<style>
/**
 * 全局样式：强制增强阅读器内的选区可见度
 * 使用与用户上传图片一致的清晰蓝色
 */
.reader-container ::selection {
  background-color: rgba(59, 130, 246, 0.4) !important;
  color: inherit !important;
}

.reader-container *::selection {
  background-color: rgba(59, 130, 246, 0.4) !important;
  color: inherit !important;
}

/* 兼容 Firefox */
.reader-container ::-moz-selection {
  background-color: rgba(59, 130, 246, 0.4) !important;
  color: inherit !important;
}
</style>
