<script setup lang="ts">
/**
 * 阅读器页面 - 沉浸式设计 [Refactored v4.0]
 * 已拆分为多个子组件：ReaderToolbar, ReaderContent, ReaderModals, ReaderKeyboard, ReaderGesture
 */
import { useReaderView } from "@/composables/useReaderView";

// 组件导入
import ReaderErrorState from "@/components/reader/ReaderErrorState.vue";
import ReaderExperience from "@/components/reader/ReaderExperience.vue";
import ReaderKeyboard from "@/components/reader/ReaderKeyboard.vue";
import ReaderGesture from "@/components/reader/ReaderGesture.vue";
import ReaderLoadingOverlay from "@/components/reader/ReaderLoadingOverlay.vue";

const {
  readerRef,
  readerPageState,
  readerPageActions,
  readerExperienceState,
  readerExperienceActions,
} = useReaderView();
</script>

<template>
  <div
    ref="readerRef"
    class="reader-container min-h-screen transition-colors duration-500 relative"
    :class="readerPageState.themeClass"
    :style="readerPageState.readerThemeStyle"
  >
    <!-- 键盘控制与手势 -->
    <ReaderKeyboard
      @prev="readerPageActions.handlePrevChapter"
      @next="readerPageActions.handleNextChapter"
      @toggle-fullscreen="readerPageActions.toggleFullscreen"
      @toggle-catalog="readerPageActions.toggleCatalog"
      @toggle-settings="readerPageActions.toggleSettings"
      @toggle-day-night="readerPageActions.toggleDayNight"
      @toggle-zen-mode="readerPageActions.toggleZenMode"
      @toggle-help="readerPageActions.toggleKeyboardHelp"
      @escape="readerPageActions.handleEscape"
    />

    <ReaderGesture
      @toggle-toolbar="readerPageActions.toggleToolbar"
      @toggle-zen-mode="readerPageActions.toggleZenMode"
    >
      <ReaderLoadingOverlay v-if="readerPageState.isLoading" />

      <ReaderErrorState
        v-else-if="readerPageState.error"
        :error="readerPageState.error"
        :error-details="readerPageState.errorDetails"
        @open-source-picker="readerPageActions.openSourcePicker"
        @retry-load="readerPageActions.retryCurrentChapter"
      />

      <ReaderExperience
        v-else
        :state="readerExperienceState"
        :actions="readerExperienceActions"
      />
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
