<script setup lang="ts">
/**
 * 阅读器页面 - 沉浸式设计 [Refactored v4.0]
 * 已拆分为多个子组件：ReaderToolbar, ReaderContent, ReaderModals, ReaderKeyboard, ReaderGesture
 */
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { useReaderView } from '@/composables/useReaderView'
import { useSettingsStore } from '@/stores/settings'

// 组件导入
import ReaderErrorState from '@/components/reader/ReaderErrorState.vue'
import ReaderExperience from '@/components/reader/ReaderExperience.vue'
import ReaderKeyboard from '@/components/reader/ReaderKeyboard.vue'
import ReaderGesture from '@/components/reader/ReaderGesture.vue'
import ReaderLoadingOverlay from '@/components/reader/ReaderLoadingOverlay.vue'

const readerRef = useTemplateRef<HTMLElement>('readerRef')

const { readerPageState, readerPageActions, readerExperienceState, readerExperienceActions } =
  useReaderView(readerRef)

const settingsStore = useSettingsStore()

// ── Firefox 进度条 JS fallback — scroll-timeline 不可用时的 rAF 更新 ──
let progressRafId: number | null = null

function updateProgressBars(): void {
  if (progressRafId) return
  progressRafId = requestAnimationFrame(() => {
    progressRafId = null
    const docH = document.documentElement.scrollHeight - window.innerHeight
    if (docH <= 0) {
      document.documentElement.style.setProperty('--ir-vert-pct', '0')
      return
    }
    const p = Math.min(1, Math.max(0, window.scrollY / docH))
    document.documentElement.style.setProperty('--ir-vert-pct', String(p))
    // 水平进度条 JS 宽度 — CSS scroll-timeline 在 Chrome/Safari 覆盖此值
    const bar = document.querySelector('.reader-progress-horiz-bar') as HTMLElement | null
    if (bar) bar.style.width = `${p * 100}%`
  })
}

function setupProgressFallback(): () => void {
  // 只在 CSS scroll-timeline 不可用时启用 JS fallback
  if (CSS.supports('animation-timeline', 'scroll()')) return () => {}
  window.addEventListener('scroll', updateProgressBars, { passive: true })
  updateProgressBars()
  return () => window.removeEventListener('scroll', updateProgressBars)
}

// 页面挂载时应用完整主题 token 系统 + 入场动画
let cleanupProgress: (() => void) | undefined

onMounted(() => {
  cleanupProgress = setupProgressFallback()

  // 内容入场动画 — 模拟参考实现的 #ir-app.is-entered
  requestAnimationFrame(() => {
    readerRef.value?.classList.add('is-entered')
  })
})

onUnmounted(() => {
  cleanupProgress?.()
})

// 键盘快捷键增强处理器
function handleScrollPageDown() {
  window.scrollBy({ top: Math.round(window.innerHeight * 0.88), behavior: 'smooth' })
}

function handleScrollDown() {
  window.scrollBy({ top: Math.round(window.innerHeight * 0.82), behavior: 'smooth' })
}

function handleScrollUp() {
  window.scrollBy({ top: -Math.round(window.innerHeight * 0.82), behavior: 'smooth' })
}

import { READER_THEMES } from '@/constants/theme-tokens'

const THEMES = READER_THEMES
function handleCycleTheme() {
  const current = settingsStore.config.theme
  const idx = THEMES.indexOf(current)
  const next = THEMES[(idx + 1) % THEMES.length]
  settingsStore.updateConfig('theme', next)
}
</script>

<template>
  <div
    ref="readerRef"
    class="reader-container min-h-screen transition-colors duration-500 relative"
  >
    <!-- 阅读氛围层 — SVG 纸张纹理 + 多层 radial 渐变光晕 -->
    <div class="reader-atmosphere" aria-hidden="true" />

    <!-- 阅读进度条 — 顶部 2px + 右侧 3px -->
    <div class="reader-progress-horiz" aria-hidden="true">
      <div class="reader-progress-horiz-bar" />
    </div>
    <div class="reader-progress-vert" aria-hidden="true" />

    <!-- 键盘控制与手势 -->
    <ReaderKeyboard
      @toggle-fullscreen="readerPageActions.toggleFullscreen"
      @toggle-catalog="readerPageActions.toggleCatalog"
      @toggle-settings="readerPageActions.toggleSettings"
      @toggle-day-night="readerPageActions.toggleDayNight"
      @toggle-help="readerPageActions.toggleKeyboardHelp"
      @escape="readerPageActions.handleEscape"
      @scroll-page-down="handleScrollPageDown"
      @scroll-down="handleScrollDown"
      @scroll-up="handleScrollUp"
      @prev-chapter="readerPageActions.handlePrevChapter"
      @next-chapter="readerPageActions.handleNextChapter"
      @cycle-theme="handleCycleTheme"
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
.reader-container {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans',
    sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-size-adjust: 0.52;
  /* 内容入场动画 — 模拟 #ir-app.is-entered */
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 0.5s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.reader-container.is-entered {
  opacity: 1;
  transform: translateY(0);
}

/* ── 阅读氛围层 ── */
.reader-atmosphere {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

/* 径向渐变光晕 + 清洗渐变 */
.reader-atmosphere::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 14% -4%, var(--ir-glow-top, transparent), transparent 28%),
    radial-gradient(ellipse at 82% 8%, var(--ir-glow-side, transparent), transparent 22%),
    radial-gradient(ellipse at 50% 100%, var(--ir-glow-bottom, transparent), transparent 36%),
    linear-gradient(
      180deg,
      var(--ir-wash-top, transparent),
      var(--ir-wash-mid, transparent) 30%,
      var(--ir-wash-low, transparent) 64%,
      transparent
    );
}

/* SVG feTurbulence 纸张纹理 */
.reader-atmosphere::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  filter: url(#ir-grain);
}

/* ── 水平进度条 (顶部 2px) ── */
.reader-progress-horiz {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 50;
  background: var(--ir-progress-bg, rgba(0, 0, 0, 0.04));
}

.reader-progress-horiz-bar {
  height: 100%;
  width: 0%;
  background: var(--ir-progress-bar, rgba(0, 0, 0, 0.2));
  transition: width 0.15s ease-out;
  will-change: width;
}

/* scroll-timeline GPU 合成进度条 (Chrome/Safari) */
@supports (animation-timeline: scroll()) {
  .reader-progress-horiz-bar {
    animation: reader-horiz-progress linear;
    animation-timeline: scroll(root);
  }

  @keyframes reader-horiz-progress {
    from {
      width: 0%;
    }

    to {
      width: 100%;
    }
  }
}

/* ── 垂直进度条 (右侧 3px) ── */
.reader-progress-vert {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  z-index: 49;
  pointer-events: none;
}

/* JS fallback: --ir-vert-pct 由 rAF scroll handler 更新 */
.reader-progress-vert::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--ir-progress-done, rgba(0, 0, 0, 0.2));
  transform-origin: top center;
  transform: scaleY(var(--ir-vert-pct, 0));
}

/* scroll-timeline GPU 合成 (Chrome/Safari) */
@supports (animation-timeline: scroll()) {
  .reader-progress-vert::before {
    animation: reader-vert-progress linear;
    animation-timeline: scroll(root);
  }

  @keyframes reader-vert-progress {
    from {
      transform: scaleY(0);
    }

    to {
      transform: scaleY(1);
    }
  }
}

/* ── View Transition 主题切换 ── */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 0.3s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Reduced motion — 禁用入场动画 */
@media (prefers-reduced-motion: reduce) {
  .reader-container {
    opacity: 1;
    transform: none;
  }
}
</style>

<style>
/**
 * 全局样式：Reader 主题 token 系统
 *
 * 核心 token 通过 CSS light-dark() 定义，响应 color-scheme 切换
 * 衍生 token 通过 CSS color-mix(in oklab, ...) + light-dark() 双模式
 * 声明在全局作用域 (unscoped)，所有组件均可引用完整 --ir-*  token
 *
 * 三层 fallback：
 *   1. @supports (color: light-dark(...)) — light-dark() 原生支持
 *   2. @supports (color: color-mix(...)) — 仅衍生 token（JS 设核心 token）
 *   3. 硬编码 fallback 值 — var() 第二个参数
 */

/* ── Layer 1: light-dark() 原生方案 (Chrome 123+, FF 120+, Safari 17.5+) ── */
@supports (color: light-dark(red, blue)) {
  :root:has(.reader-container) {
    /* 核心 token — 仅需切换 color-scheme，无需 JS setProperty */
    --ir-bg: light-dark(#edf1e7, #151718);
    --ir-panel: light-dark(rgba(250, 248, 243, 0.86), rgba(30, 33, 35, 0.94));
    --ir-text: light-dark(#1c2e24, #bcc6c1);
    --ir-text-body: light-dark(#1f3328, #b6c0bb);
    --ir-muted: light-dark(#4d6358, #8a9b94);
    --ir-faint: light-dark(#5a6e64, #6e7f78);
    --ir-placeholder: light-dark(#6e8077, #556560);
    --ir-border: light-dark(rgba(100, 140, 118, 0.15), rgba(102, 120, 115, 0.18));
    --ir-border-focus: light-dark(rgba(95, 143, 120, 0.45), rgba(118, 162, 143, 0.42));
    --ir-accent: light-dark(#5c8e76, #76a28e);
    --ir-shadow-xs: light-dark(0 1px 2px rgba(90, 120, 104, 0.04), 0 1px 3px rgba(0, 0, 0, 0.2));
    --ir-shadow-sm: light-dark(0 2px 8px rgba(90, 120, 104, 0.05), 0 2px 8px rgba(0, 0, 0, 0.28));
    --ir-shadow-md: light-dark(0 8px 24px rgba(90, 120, 104, 0.07), 0 8px 24px rgba(0, 0, 0, 0.36));
    --ir-shadow-lg: light-dark(
      0 16px 40px rgba(90, 120, 104, 0.09),
      0 16px 40px rgba(0, 0, 0, 0.48)
    );
    --ir-panel-hover: light-dark(rgba(251, 253, 248, 0.9), rgba(40, 44, 46, 0.9));
    --ir-surface-stroke: light-dark(rgba(95, 140, 117, 0.13), rgba(102, 120, 115, 0.11));
    --ir-glow-top: light-dark(rgba(95, 143, 120, 0.12), rgba(118, 162, 143, 0.04));
    --ir-glow-side: light-dark(rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.015));
    --ir-glow-bottom: light-dark(rgba(120, 155, 138, 0.07), rgba(96, 126, 115, 0.025));
    --ir-wash-top: light-dark(rgba(249, 251, 244, 0.86), rgba(24, 27, 29, 0.78));
    --ir-wash-mid: light-dark(rgba(237, 241, 230, 0.6), rgba(18, 21, 23, 0.44));
    --ir-wash-low: light-dark(rgba(230, 236, 225, 0.24), rgba(14, 17, 19, 0.14));
    --ir-heading: light-dark(#182a20, #d0dcd5);
    --ir-divider: light-dark(rgba(100, 140, 118, 0.13), rgba(102, 120, 115, 0.11));
  }
}

/* ── 衍生 token — 双模式 color-mix() (light-dark 环境) ── */
@supports (color: light-dark(red, blue)) and (color: color-mix(in oklab, red, blue)) {
  :root:has(.reader-container) {
    --ir-panel-alt: light-dark(
      color-mix(in oklab, var(--ir-bg) 92%, var(--ir-text) 8%),
      color-mix(in oklab, var(--ir-bg) 94%, var(--ir-text) 6%)
    );
    --ir-panel-elevated: light-dark(
      color-mix(in oklab, var(--ir-bg) 96%, white 4%),
      color-mix(in oklab, var(--ir-bg) 97%, white 3%)
    );
    --ir-accent-soft: light-dark(
      color-mix(in oklab, var(--ir-accent) 12%, transparent),
      color-mix(in oklab, var(--ir-accent) 14%, transparent)
    );
    --ir-accent-glow: light-dark(
      color-mix(in oklab, var(--ir-accent) 20%, transparent),
      color-mix(in oklab, var(--ir-accent) 22%, transparent)
    );
    --ir-panel-strong: light-dark(
      color-mix(in oklab, var(--ir-bg) 86%, var(--ir-muted) 14%),
      color-mix(in oklab, var(--ir-bg) 88%, var(--ir-muted) 12%)
    );
    --ir-panel-soft: light-dark(
      color-mix(in oklab, var(--ir-bg) 72%, var(--ir-panel) 28%),
      color-mix(in oklab, var(--ir-bg) 78%, var(--ir-panel) 22%)
    );
    --ir-progress-bar: light-dark(
      color-mix(in oklab, var(--ir-accent) 32%, transparent),
      color-mix(in oklab, var(--ir-accent) 32%, transparent)
    );
    --ir-progress-bg: light-dark(
      color-mix(in oklab, var(--ir-accent) 6%, transparent),
      color-mix(in oklab, var(--ir-accent) 5%, transparent)
    );
    --ir-progress-done: light-dark(
      color-mix(in oklab, var(--ir-accent) 70%, var(--ir-text) 30%),
      color-mix(in oklab, var(--ir-accent) 72%, var(--ir-text) 28%)
    );
    --ir-selection: light-dark(
      color-mix(in oklab, var(--ir-accent) 22%, transparent),
      color-mix(in oklab, var(--ir-accent) 26%, transparent)
    );
    --ir-button-bg: light-dark(
      color-mix(in oklab, var(--ir-bg) 70%, white 30%),
      color-mix(in oklab, var(--ir-bg) 74%, white 26%)
    );
    --ir-ripple: light-dark(
      color-mix(in oklab, var(--ir-accent) 14%, transparent),
      color-mix(in oklab, var(--ir-accent) 16%, transparent)
    );
    --ir-card-bg: light-dark(
      color-mix(in oklab, var(--ir-bg) 56%, white 44%),
      color-mix(in oklab, var(--ir-bg) 62%, white 38%)
    );
  }
}

/* ── Layer 2: color-mix() fallback (无 light-dark 支持时) ── */
@supports (color: color-mix(in oklab, red, blue)) and not (color: light-dark(red, blue)) {
  :root:has(.reader-container) {
    --ir-panel-alt: color-mix(in oklab, var(--ir-bg) 92%, var(--ir-text) 8%);
    --ir-panel-elevated: color-mix(in oklab, var(--ir-bg) 96%, white 4%);
    --ir-accent-soft: color-mix(in oklab, var(--ir-accent) 12%, transparent);
    --ir-accent-glow: color-mix(in oklab, var(--ir-accent) 20%, transparent);
    --ir-panel-strong: color-mix(in oklab, var(--ir-bg) 86%, var(--ir-muted) 14%);
    --ir-panel-soft: color-mix(in oklab, var(--ir-bg) 72%, var(--ir-panel) 28%);
    --ir-progress-bar: color-mix(in oklab, var(--ir-accent) 32%, transparent);
    --ir-progress-bg: color-mix(in oklab, var(--ir-accent) 6%, transparent);
    --ir-progress-done: color-mix(in oklab, var(--ir-accent) 70%, var(--ir-text) 30%);
    --ir-selection: color-mix(in oklab, var(--ir-accent) 22%, transparent);
    --ir-button-bg: color-mix(in oklab, var(--ir-bg) 70%, white 30%);
    --ir-ripple: color-mix(in oklab, var(--ir-accent) 14%, transparent);
    --ir-card-bg: color-mix(in oklab, var(--ir-bg) 56%, white 44%);
  }

  /* Dark overrides via .ir-dark class (JS fallback) — class is on :root */
  :root.ir-dark:has(.reader-container) {
    --ir-panel-alt: color-mix(in oklab, var(--ir-bg) 94%, var(--ir-text) 6%);
    --ir-panel-elevated: color-mix(in oklab, var(--ir-bg) 97%, white 3%);
    --ir-accent-soft: color-mix(in oklab, var(--ir-accent) 14%, transparent);
    --ir-accent-glow: color-mix(in oklab, var(--ir-accent) 22%, transparent);
    --ir-panel-strong: color-mix(in oklab, var(--ir-bg) 88%, var(--ir-muted) 12%);
    --ir-panel-soft: color-mix(in oklab, var(--ir-bg) 78%, var(--ir-panel) 22%);
    --ir-progress-bar: color-mix(in oklab, var(--ir-accent) 32%, transparent);
    --ir-progress-bg: color-mix(in oklab, var(--ir-accent) 5%, transparent);
    --ir-progress-done: color-mix(in oklab, var(--ir-accent) 72%, var(--ir-text) 28%);
    --ir-selection: color-mix(in oklab, var(--ir-accent) 26%, transparent);
    --ir-button-bg: color-mix(in oklab, var(--ir-bg) 74%, white 26%);
    --ir-ripple: color-mix(in oklab, var(--ir-accent) 16%, transparent);
    --ir-card-bg: color-mix(in oklab, var(--ir-bg) 62%, white 38%);
  }
}

/* ── 全局 selection 覆盖 ── */
.reader-container ::selection {
  background-color: var(--ir-selection, rgba(59, 130, 246, 0.4));
  color: inherit;
}

.reader-container *::selection {
  background-color: var(--ir-selection, rgba(59, 130, 246, 0.4));
  color: inherit;
}

.reader-container ::-moz-selection {
  background-color: var(--ir-selection, rgba(59, 130, 246, 0.4));
  color: inherit;
}
</style>
