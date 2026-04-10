<script setup lang="ts">
/**
 * 阅读器页面 - 沉浸式设计 [Refactored v4.0]
 * 已拆分为多个子组件：ReaderToolbar, ReaderContent, ReaderModals, ReaderKeyboard, ReaderGesture
 */
import { useReaderView } from '@/composables/useReaderView'

// 组件导入
import ReaderErrorState from '@/components/reader/ReaderErrorState.vue'
import ReaderExperience from '@/components/reader/ReaderExperience.vue'
import ReaderKeyboard from '@/components/reader/ReaderKeyboard.vue'
import ReaderGesture from '@/components/reader/ReaderGesture.vue'
import ReaderLoadingOverlay from '@/components/reader/ReaderLoadingOverlay.vue'

const {
  readerRef,
  readerPageState,
  readerPageActions,
  readerExperienceState,
  readerExperienceActions,
} = useReaderView()
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
      @toggle-fullscreen="readerPageActions.toggleFullscreen"
      @toggle-catalog="readerPageActions.toggleCatalog"
      @toggle-settings="readerPageActions.toggleSettings"
      @toggle-day-night="readerPageActions.toggleDayNight"
      @toggle-help="readerPageActions.toggleKeyboardHelp"
      @escape="readerPageActions.handleEscape"
    />

    <ReaderGesture @toggle-toolbar="readerPageActions.toggleToolbar">
      <ReaderLoadingOverlay v-if="readerPageState.isLoading" />

      <ReaderErrorState
        v-else-if="readerPageState.error"
        :error="readerPageState.error"
        :error-details="readerPageState.errorDetails"
        @open-source-picker="readerPageActions.openSourcePicker"
        @retry-load="readerPageActions.retryCurrentChapter"
      />

      <ReaderExperience v-else :state="readerExperienceState" :actions="readerExperienceActions" />
    </ReaderGesture>
  </div>
</template>

<style scoped>
/* 核心排版样式：Notion/Linear 极简风 */
.reader-container {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans',
    sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 简约主题 - 仅保留必要的日/夜/护眼模式 */
.theme-white {
  background: #ffffff;
  color: #37352f; /* Notion-like dark gray */
}
.theme-paper {
  background: #f7f6f3; /* Notion-like light beige */
  color: #37352f;
}
.theme-night {
  background: #191919; /* Linear-like dark */
  color: rgba(255, 255, 255, 0.81);
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
