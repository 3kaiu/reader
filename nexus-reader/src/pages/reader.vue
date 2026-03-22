<script setup lang="ts">
/**
 * 阅读器页面 - 沉浸式设计 [Refactored v4.0]
 * 已拆分为多个子组件：ReaderToolbar, ReaderContent, ReaderModals, ReaderKeyboard, ReaderGesture
 */
import { Loader2 } from "lucide-vue-next";
import { useReaderView } from "@/composables/useReaderView";

// 组件导入
import ReaderToolbar from "@/components/reader/ReaderToolbar.vue";
import ReaderContent from "@/components/reader/ReaderContent.vue";
import ReaderModals from "@/components/reader/ReaderModals.vue";
import ReaderKeyboard from "@/components/reader/ReaderKeyboard.vue";
import ReaderGesture from "@/components/reader/ReaderGesture.vue";
import { KEYBOARD_SHORTCUTS } from "@/constants/reader";
import BreakReminder from "@/components/BreakReminder.vue";
import DecoderStatusIndicator from "@/components/decoder/DecoderStatusIndicator.vue";
import DecoderSettingsSheet from "@/components/decoder/DecoderSettingsSheet.vue";
import DecoderCard from "@/components/decoder/DecoderCard.vue";

const {
  readerRef,
  isFullscreen,
  toggleFullscreen,
  contentRef,
  activeBookUrl,
  readerStore,
  settingsStore,
  decoderStore,
  eyeCare,
  decoderAddonEnabled,
  showToolbar,
  showCatalog,
  showSettings,
  showSourcePicker,
  showBookInfo,
  showKeyboardHelp,
  showDecoderSettings,
  toggleToolbar,
  toggleZenMode,
  toggleCatalog,
  openCatalog,
  toggleSettings,
  openSettings,
  toggleKeyboardHelp,
  openSourcePicker,
  openBookInfo,
  openDecoderSettings,
  goBack,
  handleEscape,
  page: swipePage,
  totalPages: swipeTotalPages,
  layout: swipeLayout,
  contentStyle,
  readerThemeStyle,
  isNightMode,
  toggleDayNight,
  handlePrevChapter,
  handleNextChapter,
  handleRefresh,
  handleSelectChapter,
  handleToggleDecoder,
  decodeCurrentChapter,
  handleEntityClick,
  handleConfirmEntity,
  handleCorrectEntity,
  formattedTime,
} = useReaderView();
</script>

<template>
  <div
    ref="readerRef"
    class="reader-container min-h-screen transition-colors duration-500 relative"
    :class="[
      `theme-${settingsStore.config.theme}`,
      { 'overflow-hidden': settingsStore.config.readingMode === 'swipe' },
    ]"
    :style="readerThemeStyle"
  >
    <!-- 键盘控制与手势 -->
    <ReaderKeyboard
      @prev="handlePrevChapter"
      @next="handleNextChapter"
      @toggle-fullscreen="toggleFullscreen"
      @toggle-catalog="toggleCatalog"
      @toggle-settings="toggleSettings"
      @toggle-day-night="toggleDayNight"
      @toggle-zen-mode="toggleZenMode"
      @toggle-help="toggleKeyboardHelp"
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
            @click="openSourcePicker"
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
          @toggle-catalog="openCatalog"
          @toggle-fullscreen="toggleFullscreen"
          @toggle-day-night="toggleDayNight"
          @toggle-settings="openSettings"
          @toggle-eye-care="
            eyeCare.config.value.enabled ? eyeCare.disable() : eyeCare.enable()
          "
          @toggle-zen-mode="toggleZenMode"
          @refresh="handleRefresh"
          @prev-chapter="handlePrevChapter"
          @next-chapter="handleNextChapter"
          @open-source-picker="openSourcePicker"
          @open-book-info="openBookInfo"
          @toggle-decoder="handleToggleDecoder"
          @open-decoder-settings="openDecoderSettings"
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
          @select-chapter="handleSelectChapter"
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
          :book-url="activeBookUrl"
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
