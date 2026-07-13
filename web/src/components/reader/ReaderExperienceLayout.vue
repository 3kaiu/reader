<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ArrowUp } from 'lucide-vue-next'
import ReaderContent from '@/components/reader/ReaderContent.vue'
import ReaderModals from '@/components/reader/ReaderModals.vue'
import ReaderToolbar from '@/components/reader/ReaderToolbar.vue'
import ReaderInlineSettings from '@/components/reader/ReaderInlineSettings.vue'
import type { ReaderExperienceLayoutBindingOptions } from './reader-experience-layout-binding-types'

const props = defineProps<ReaderExperienceLayoutBindingOptions>()

// FAB 回顶部按钮 — 滚动超过 500px 显示
const showFab = ref(false)
let fabTicking = false

const updateFab = () => {
  if (fabTicking) return
  fabTicking = true
  requestAnimationFrame(() => {
    showFab.value = window.scrollY > 500
    fabTicking = false
  })
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── 内嵌设置面板 — 从 topbar "阅读设置" chip 触发 ──
const showInlineSettings = ref(false)

function toggleInlineSettings() {
  showInlineSettings.value = !showInlineSettings.value
}

// 覆盖 toolbar bindings 中的 onToggleSettings → 触发内嵌面板
const overriddenToolbarBindings = computed(() => {
  const base = props.toolbarBindings.value
  return {
    ...base,
    onToggleSettings: toggleInlineSettings,
  }
})

onMounted(() => {
  window.addEventListener('scroll', updateFab, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('scroll', updateFab)
})
</script>

<template>
  <ReaderToolbar v-bind="overriddenToolbarBindings" />

  <ReaderContent :ref="contentRef" v-bind="contentBindings.value" />

  <ReaderModals v-bind="modalBindings.value" />

  <!-- 内嵌阅读设置面板 (WeChat Read 风格) -->
  <ReaderInlineSettings v-model:open="showInlineSettings" />

  <!-- 回顶部 FAB -->
  <button
    type="button"
    class="reader-fab"
    :class="{ 'is-visible': showFab }"
    aria-label="回顶部"
    @click="scrollToTop"
  >
    <ArrowUp class="w-[18px] h-[18px]" />
  </button>
</template>

<style scoped>
.reader-fab {
  position: fixed;
  right: calc(24px + env(safe-area-inset-right, 0px));
  bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  z-index: 36;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid var(--ir-border, rgba(0, 0, 0, 0.1));
  background: var(--ir-panel, rgba(255, 255, 255, 0.86));
  color: var(--ir-muted, rgba(0, 0, 0, 0.4));
  box-shadow: var(--ir-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.1));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transform: translateY(12px) scale(0.9);
  transition:
    opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.reader-fab.is-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.reader-fab:hover {
  border-color: var(--ir-accent, rgba(0, 0, 0, 0.3));
  color: var(--ir-accent, #333);
  box-shadow: var(--ir-shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.15));
  transform: translateY(-2px) scale(1.04);
}

.reader-fab:active {
  transform: scale(0.94);
}

/* 键盘焦点指示器 */
.reader-fab:focus-visible {
  outline: 2px solid var(--ir-accent, #5c8e76);
  outline-offset: 2px;
}

/* 涟漪效果 */
.reader-fab::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  background: var(--ir-ripple, rgba(0, 0, 0, 0.08));
  opacity: 0;
  transition: opacity 0.15s ease;
}

.reader-fab:active::after {
  opacity: 1;
}

/* 移动端适配 */
@media (max-width: 760px) {
  .reader-fab {
    right: calc(12px + env(safe-area-inset-right, 0px));
    bottom: calc(104px + env(safe-area-inset-bottom, 0px));
    width: 38px;
    height: 38px;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .reader-fab.is-visible {
    transform: none;
  }
}

/* Forced colors */
@media (forced-colors: active) {
  .reader-fab {
    border: 1px solid ButtonText;
    box-shadow: none;
  }

  .reader-fab.is-visible {
    border-color: Highlight;
  }
}
</style>
