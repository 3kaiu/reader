<script setup lang="ts">
/**
 * 阅读器页面 - 沉浸式设计 [Refactored v4.0]
 * 已拆分为多个子组件：ReaderToolbar, ReaderContent, ReaderModals, ReaderKeyboard, ReaderGesture
 */
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  onBeforeUnmount,
  watch,
  nextTick,
} from "vue";
import { useRouter, useRoute } from "vue-router";
import { useToast } from "@/components/ui/toast/use-toast";
import { X, Loader2 } from "lucide-vue-next";
import { useReaderStore } from "@/stores/reader";
import { useSettingsStore } from "@/stores/settings";
import { readingJourneyService } from "@/services/journey/reading";
import {
  useFullscreen,
  useThrottleFn,
  useDateFormat,
  useNow,
  useScroll,
} from "@vueuse/core";
import { useOfflineStore } from "@/stores/offlineStorage";
import { useSwipeMode } from "@/composables/useSwipeMode";
import { useEyeCare } from "@/composables/useEyeCare";
import { useDecoderStore } from "@/stores/decoder";
import { useEngagementTracker } from "@/composables/useEngagementTracker";
import { useEventManager } from "@/utils/eventManager";
import { isOptionalFeatureEnabled } from "@/utils/features";

// 组件导入
import ReaderToolbar from "@/components/reader/ReaderToolbar.vue";
import ReaderContent from "@/components/reader/ReaderContent.vue";
import ReaderModals from "@/components/reader/ReaderModals.vue";
import ReaderKeyboard from "@/components/reader/ReaderKeyboard.vue";
import ReaderGesture from "@/components/reader/ReaderGesture.vue";
import { KEYBOARD_SHORTCUTS, MOOD_COLORS } from "@/constants/reader";
import BreakReminder from "@/components/BreakReminder.vue";
import DecoderStatusIndicator from "@/components/decoder/DecoderStatusIndicator.vue";
import DecoderSettingsSheet from "@/components/decoder/DecoderSettingsSheet.vue";
import DecoderCard from "@/components/decoder/DecoderCard.vue";

const router = useRouter();
const route = useRoute();
const { toast } = useToast();
const readerStore = useReaderStore();
const settingsStore = useSettingsStore();
const offlineStore = useOfflineStore();
const decoderStore = useDecoderStore();
const eyeCare = useEyeCare();
const decoderAddonEnabled = isOptionalFeatureEnabled("decoder");

// ====== 状态与全屏 ======
const readerRef = ref<HTMLElement | null>(null);
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(readerRef);

const showToolbar = ref(false);
const showCatalog = ref(false);
const showSettings = ref(false);
const showSourcePicker = ref(false);
const showBookInfo = ref(false);
const showKeyboardHelp = ref(false);
const showDecoderSettings = ref(false);
const hideToolbarTimer = ref<ReturnType<typeof setTimeout> | null>(null);

// ====== 综合样式计算 ======
const contentStyle = computed(() => ({
  fontSize: `${settingsStore.config.fontSize}px`,
  lineHeight: settingsStore.config.lineHeight,
  fontWeight: settingsStore.config.fontWeight,
  fontFamily: settingsStore.currentFontFamily,
  color: settingsStore.themeColors.text,
  maxWidth: `${settingsStore.config.pageWidth}px`,
  "--custom-bg": settingsStore.themeColors.bg,
  "--custom-text": settingsStore.themeColors.text,
}));

// ====== 工具方法 ======
function toggleToolbar() {
  if (settingsStore.config.zenMode) return;
  showToolbar.value = !showToolbar.value;
  if (showToolbar.value) startHideTimer();
}

function toggleZenMode() {
  const newState = !settingsStore.config.zenMode;
  settingsStore.updateConfig("zenMode", newState);
  if (newState) {
    showToolbar.value = showSettings.value = showCatalog.value = false;
    toast({
      title: "已进入禅模式",
      description: "所有界面已隐藏，双击中央区域退出",
      duration: 3000,
    });
  } else {
    toast({ title: "已退出禅模式", duration: 2000 });
  }
}

const isNightMode = computed(() => settingsStore.config.theme === "night");
function toggleDayNight() {
  settingsStore.updateConfig("theme", isNightMode.value ? "white" : "night");
}

// ====== Composables 初始化 ======
const {
  page: swipePage,
  totalPages: swipeTotalPages,
  layout: swipeLayout,
  nextPage,
  prevPage,
} = useSwipeMode({ readerStore, settingsStore, toggleToolbar, toast });

const { startTracking, stopTracking } = useEngagementTracker(
  route.query.url as string,
  readerStore.currentChapterIndex
);
const { addEventListener, cleanup: cleanupEventListeners } = useEventManager();

// ====== 导航逻辑 ======
async function handlePrevChapter() {
  if (settingsStore.config.readingMode === "swipe") return prevPage();
  if (!readerStore.hasPrevChapter) return;
  await readerStore.prevChapter();
  readerStore.initInfiniteScroll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function handleNextChapter() {
  if (settingsStore.config.readingMode === "swipe") return nextPage();
  if (!readerStore.hasNextChapter) return;
  await readerStore.nextChapter();
  readerStore.initInfiniteScroll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function handleRefresh() {
  try {
    const scrollRatio = await readerStore.refreshChapter();
    await nextTick();
    setTimeout(() => {
      const newScrollHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({
        top: scrollRatio * newScrollHeight,
        behavior: "auto",
      });
    }, 100);
  } catch (error) {
    toast({
      title: "刷新失败",
      description: error instanceof Error ? error.message : "章节刷新失败",
      duration: 3000,
    });
  }
}

function goBack() {
  router.push("/");
}

function handleEscape() {
  if (decoderAddonEnabled && decoderStore.showCard) {
    decoderStore.closeCard();
    return;
  }
  if (showDecoderSettings.value) {
    showDecoderSettings.value = false;
    return;
  }
  if (showKeyboardHelp.value) {
    showKeyboardHelp.value = false;
    return;
  }
  if (showBookInfo.value) {
    showBookInfo.value = false;
    return;
  }
  if (showSourcePicker.value) {
    showSourcePicker.value = false;
    return;
  }
  if (showSettings.value) {
    showSettings.value = false;
    return;
  }
  if (showCatalog.value) {
    showCatalog.value = false;
    return;
  }
  if (showToolbar.value) {
    showToolbar.value = false;
    return;
  }
  goBack();
}

// ====== 解密功能 ======
async function handleToggleDecoder(enabled: boolean) {
  if (!decoderAddonEnabled) return;
  const bookUrl = route.query.url as string;
  if (!bookUrl) return;

  decoderStore.updateBookSettings(bookUrl, { enabled });

  if (enabled) {
    // 启用时立即解码当前章节
    await decodeCurrentChapter();
  }
}

async function decodeCurrentChapter() {
  if (!decoderAddonEnabled) return;
  const bookUrl = route.query.url as string;
  const sourceId = route.query.source as string;
  if (!bookUrl || !readerStore.content) return;

  const { useDecoder } = await import("@/composables/useDecoder");
  const decoder = useDecoder();

  decoderStore.setDecoding(true);

  try {
    const result = await decoder.decodeChapter(
      bookUrl,
      readerStore.currentChapter?.url || "",
      readerStore.content,
      {
        type: decoderStore.currentSettings.bookType || "urban",
        tags: readerStore.currentBook?.tags,
      }
    );

    if (result) {
      decoderStore.setDecodeResult(result.entities, result.context);
    } else {
      decoderStore.setDecodeError(decoder.error.value || "解码失败");
    }
  } catch (e) {
    decoderStore.setDecodeError(e instanceof Error ? e.message : "解码失败");
  }
}

// 监听章节变化，自动解码
watch(
  () => readerStore.currentChapterIndex,
  async () => {
    if (decoderAddonEnabled && decoderStore.isEnabled) {
      await decodeCurrentChapter();
    }
  }
);

// 处理实体点击
function handleEntityClick(entity: any, event: MouseEvent) {
  // 计算卡片位置
  const rect = (event.target as HTMLElement).getBoundingClientRect();
  const position = {
    x: rect.left + rect.width / 2,
    y: rect.bottom + 8,
  };

  // 确保卡片不超出屏幕
  const cardWidth = 288;
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  if (position.x - cardWidth / 2 < 16) {
    position.x = cardWidth / 2 + 16;
  } else if (position.x + cardWidth / 2 > screenWidth - 16) {
    position.x = screenWidth - cardWidth / 2 - 16;
  }

  if (position.y + 300 > screenHeight) {
    position.y = rect.top - 8;
  }

  decoderStore.selectEntity(entity, position);
}

// 处理实体确认
async function handleConfirmEntity(entity: any) {
  const { useDecoder } = await import("@/composables/useDecoder");
  const decoder = useDecoder();
  const bookUrl = route.query.url as string;

  const success = await decoder.confirmEntity(
    entity,
    bookUrl,
    decoderStore.currentSettings.bookType || undefined
  );

  if (success) {
    decoderStore.closeCard();
    toast({ title: "已确认", duration: 2000 });
  }
}

// 处理实体纠正
async function handleCorrectEntity(entity: any, newReal: string) {
  const { useDecoder } = await import("@/composables/useDecoder");
  const decoder = useDecoder();
  const bookUrl = route.query.url as string;

  const success = await decoder.correctEntity(
    entity,
    newReal,
    bookUrl,
    decoderStore.currentSettings.bookType || undefined
  );

  if (success) {
    decoderStore.closeCard();
    toast({ title: "已纠正", duration: 2000 });
    // 重新解码
    await decodeCurrentChapter();
  }
}

// ====== 自动控制 ======
function startHideTimer() {
  clearHideTimer();
  hideToolbarTimer.value = setTimeout(() => {
    if (!showSettings.value && !showCatalog.value) showToolbar.value = false;
  }, 4000);
}
function clearHideTimer() {
  if (hideToolbarTimer.value) {
    clearTimeout(hideToolbarTimer.value);
    hideToolbarTimer.value = null;
  }
}

// ====== 观察者与监听 ======
// 使用更小的触发距离，并添加防抖处理
const { arrivedState } = useScroll(window, { offset: { bottom: 200 } });

// 防抖处理，避免频繁触发
const debouncedAppendNext = useThrottleFn(async () => {
  if (readerStore.hasNextChapter && !readerStore.isLoadingMore) {
    const success = await readerStore.appendNextChapter();
    if (!success) {
      // 如果加载失败，错误状态已经在store中设置，UI会显示重试按钮
      console.warn("自动加载下一章失败，显示重试选项");
    }
  }
}, 1000); // 1秒内最多触发一次

// 章节位置同步 - 防抖处理滚动事件
const debouncedChapterSync = useThrottleFn(() => {
  if (settingsStore.config.readingMode === "scroll") {
    readerStore.updateChapterIndexByScroll();
  }
}, 500); // 500ms内最多触发一次

watch(
  () => arrivedState.bottom,
  (isBottom) => {
    if (isBottom && settingsStore.config.readingMode === "scroll") {
      // 如果有加载错误，不自动触发，让用户手动重试
      if (!readerStore.loadError) {
        debouncedAppendNext();
      }
    }
  }
);

// 监听滚动事件来同步章节位置
onMounted(() => {
  addEventListener(window, "scroll", debouncedChapterSync, { passive: true });
  addEventListener(window, "beforeunload", () => readerStore.saveProgress());
});

onUnmounted(() => {
  cleanupEventListeners();
});

// ====== 生命周期 ======
onMounted(() => {
  initReader();
  offlineStore.loadCacheIndex();
  nextTick(() => {
    if (selectionContainerRef.value) startTracking(selectionContainerRef.value);
  });
});

onBeforeUnmount(() => {
  if (selectionContainerRef.value) stopTracking(selectionContainerRef.value);
  readerStore.saveProgress();
  cleanupEventListeners();
});
onUnmounted(() => {
  clearHideTimer();
  readerStore.reset();
});

async function initReader() {
  const { url: bookUrl, source: sourceId } = route.query;
  if (!bookUrl || !sourceId) {
    toast({ title: "缺少书籍信息", variant: "destructive" });
    router.push("/");
    return;
  }
  settingsStore.applyAutoNightMode();

  // 初始化解密 store
  if (decoderAddonEnabled) {
    decoderStore.setCurrentBook(bookUrl as string);
  }

  try {
    const res = await readingJourneyService.getBookInfo(
      sourceId as string,
      bookUrl as string
    );
    if (res.isSuccess) {
      await readerStore.openBook({
        ...res.data,
        sourceId: sourceId as string,
        bookUrl: bookUrl as string,
      });
      readerStore.initInfiniteScroll();

    } else {
      toast({
        title: res.errorMsg || "获取书籍信息失败",
        variant: "destructive",
      });
    }
  } catch (error: any) {
    toast({ title: "加载书籍失败", variant: "destructive" });
  }
}

const contentRef = ref<any>(null);
const selectionContainerRef = computed(() =>
  settingsStore.config.readingMode === "swipe"
    ? contentRef.value?.swipeContentRef
    : contentRef.value?.$el?.querySelector(".reader-text")
);
const formattedTime = useDateFormat(useNow(), "HH:mm");
</script>

<template>
  <div
    ref="readerRef"
    class="reader-container min-h-screen transition-colors duration-500 relative"
    :class="[
      `theme-${settingsStore.config.theme}`,
      { 'overflow-hidden': settingsStore.config.readingMode === 'swipe' },
    ]"
    :style="
      settingsStore.config.theme === 'custom' &&
      settingsStore.config.customColors
        ? {
            backgroundColor: settingsStore.config.customColors.background,
            color: settingsStore.config.customColors.text,
          }
        : {}
    "
  >
    <!-- 键盘控制与手势 -->
    <ReaderKeyboard
      @prev="handlePrevChapter"
      @next="handleNextChapter"
      @toggle-fullscreen="toggleFullscreen"
      @toggle-catalog="showCatalog = !showCatalog"
      @toggle-settings="showSettings = !showSettings"
      @toggle-day-night="toggleDayNight"
      @toggle-zen-mode="toggleZenMode"
      @toggle-help="showKeyboardHelp = !showKeyboardHelp"
      @escape="handleEscape"
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
      <div
        v-if="readerStore.isLoading"
        class="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md"
      >
        <div class="flex flex-col items-center gap-6">
          <Loader2 class="w-16 h-16 text-primary/10 animate-spin" />
          <p
            class="text-xs font-medium tracking-widest text-primary/40 uppercase"
          >
            Loading Content
          </p>
        </div>
      </div>

      <!-- 错误状态 -->
      <div
        v-else-if="readerStore.error"
        class="min-h-screen flex items-center justify-center p-6 z-40 relative"
      >
        <div class="text-center max-w-sm">
          <h2 class="text-lg font-semibold mb-2">加载失败</h2>
          <p class="text-sm mb-6 opacity-60">{{ readerStore.error }}</p>
          <button
            class="w-full py-3 px-6 rounded-xl bg-primary/10 hover:bg-primary/20"
            @click="showSourcePicker = true"
          >
            查看书源说明
          </button>
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
          :is-eye-care-enabled="eyeCare.config.value.enabled"
          :content-issue="readerStore.loadError"
          :show-decoder-action="decoderAddonEnabled"
          :is-decoder-enabled="decoderAddonEnabled && decoderStore.isEnabled"
          :is-decoding="decoderAddonEnabled && decoderStore.isDecoding"
          @back="goBack"
          @toggle-catalog="showCatalog = true"
          @toggle-fullscreen="toggleFullscreen"
          @toggle-day-night="toggleDayNight"
          @toggle-settings="showSettings = true"
          @toggle-eye-care="
            eyeCare.config.value.enabled ? eyeCare.disable() : eyeCare.enable()
          "
          @toggle-zen-mode="toggleZenMode"
          @refresh="handleRefresh"
          @prev-chapter="handlePrevChapter"
          @next-chapter="handleNextChapter"
          @open-source-picker="showSourcePicker = true"
          @open-book-info="showBookInfo = true"
          @toggle-decoder="handleToggleDecoder"
          @open-decoder-settings="showDecoderSettings = true"
        />

        <ReaderContent
          ref="contentRef"
          :reading-mode="settingsStore.config.readingMode"
          :content-style="contentStyle"
          :loaded-chapters="readerStore.loadedChapters"
          :is-loading-more="readerStore.isLoadingMore"
          :current-chapter="readerStore.currentChapter"
          :current-chapter-index="readerStore.currentChapterIndex"
          :total-chapters="readerStore.totalChapters"
          :swipe-page="swipePage"
          :swipe-total-pages="swipeTotalPages"
          :swipe-layout="swipeLayout"
          :page-transition="settingsStore.config.pageAnimation"
          :show-toolbar="showToolbar"
          :is-fullscreen="isFullscreen"
          :formatted-time="formattedTime"
          :paragraph-spacing="settingsStore.config.paragraphSpacing"
          :formatted-content="readerStore.formattedContent"
          :is-parsing="readerStore.isParsing"
          :has-next-chapter="readerStore.hasNextChapter"
          :load-error="readerStore.loadError"
          :decoder-enabled="decoderAddonEnabled && decoderStore.isEnabled"
          :decoder-entities="decoderAddonEnabled ? decoderStore.currentEntities : []"
          @load-next-chapter="readerStore.appendNextChapter"
          @retry-load="readerStore.retryLoadNext"
          @entity-click="handleEntityClick"
        />

        <ReaderModals
          v-model:show-catalog="showCatalog"
          v-model:show-settings="showSettings"
          v-model:show-source-picker="showSourcePicker"
          v-model:show-book-info="showBookInfo"
          v-model:show-keyboard-help="showKeyboardHelp"
          :book="readerStore.currentBook"
          :chapters="readerStore.catalog"
          :current-ind="readerStore.currentChapterIndex"
          :catalog-loading="readerStore.isLoading"
          :keyboard-shortcuts="KEYBOARD_SHORTCUTS"
          @select-chapter="
            async (idx) => {
              if (settingsStore.config.readingMode === 'scroll') {
                await readerStore.goToChapterInScroll(idx);
                await nextTick();
                // 查找对应章节标记并滚动到该位置
                const chapterMarker = document.querySelector(
                  `[data-chapter-index='${idx}']`
                );
                if (chapterMarker) {
                  chapterMarker.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                } else {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              } else {
                await readerStore.goToChapter(idx);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }
          "
          @refresh="handleRefresh"
        />

        <BreakReminder
          v-if="eyeCare.showBreakReminder.value"
          :reading-time="eyeCare.formatReadingTime()"
          @dismiss="eyeCare.dismissBreakReminder()"
        />

        <!-- 解密状态指示器 -->
        <DecoderStatusIndicator
          v-if="decoderAddonEnabled && decoderStore.isEnabled"
          :is-decoding="decoderStore.isDecoding"
          :error="decoderStore.decodeError"
          :entities-count="decoderStore.validEntitiesCount"
          :has-decoded="
            decoderStore.currentEntities.length > 0 ||
            decoderStore.decodeError !== null
          "
          @retry="decodeCurrentChapter"
        />

        <!-- 解密设置面板 -->
        <DecoderSettingsSheet
          v-if="decoderAddonEnabled"
          v-model:open="showDecoderSettings"
          :book-url="route.query.url as string"
        />

        <!-- 解密卡片 -->
        <Teleport to="body">
          <DecoderCard
            v-if="decoderAddonEnabled && decoderStore.selectedEntity"
            :entity="decoderStore.selectedEntity"
            :position="decoderStore.cardPosition"
            :visible="decoderStore.showCard"
            @close="decoderStore.closeCard"
            @confirm="handleConfirmEntity"
            @correct="handleCorrectEntity"
          />
        </Teleport>
      </template>
    </ReaderGesture>
  </div>
</template>

<style scoped>
/* 核心排版样式保留 */
.reader-container {
  font-family: sans-serif;
}
.theme-white {
  background: #ffffff;
  color: #242424;
}
.theme-paper {
  background: #faf7ed;
  color: #38342f;
}
.theme-sepia {
  background: #efe6d5;
  color: #4a3b32;
}
.theme-gray {
  background: #f2f3f5;
  color: #2b2b2b;
}
.theme-green {
  background: #e6f0e6;
  color: #2e362c;
}
.theme-night {
  background: #1c1c1e;
  color: #a1a1aa;
}
.theme-custom {
  background: var(--custom-bg);
  color: var(--custom-text);
}
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
