<script setup lang="ts">
/**
 * ReaderInlineSettings — 阅读页内嵌轻量设置面板
 * 参考 69shuba Immersive Reader 微信读书风格
 *
 * 提供：背景主题 (3 cards) + 字体 (6 cards) + 字号/宽度/行距/段间距 sliders + 快捷键
 * 从右侧弹出，毛玻璃面板，带 backdrop 遮罩
 */
import { computed, useId } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { READER_THEMES, getThemeTokens } from '@/constants/theme-tokens'
import { FONT_FAMILY_MAP } from '@/stores/settings-store/helpers'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const settingsStore = useSettingsStore()

// ── 主题 ──
const themes = computed(() =>
  READER_THEMES.map(t => ({
    key: t,
    label: getThemeTokens(t).label,
  }))
)

function selectTheme(theme: 'wechat' | 'mist' | 'night') {
  settingsStore.updateConfig('theme', theme)
}

// ── 字体 ──
const fonts = computed(() =>
  (Object.entries(FONT_FAMILY_MAP) as [FontFamily, string][]).map(([key]) => {
    const labels: Record<FontFamily, string> = {
      system: '系统默认',
      heiti: '黑体',
      kaiti: '楷体',
      songti: '宋体',
      fangsong: '仿宋',
      lxgw: '霞鹜文楷',
    }
    return { key, label: labels[key] || key }
  })
)

import type { FontFamily } from '@/types/settings'

function selectFont(font: FontFamily) {
  settingsStore.updateConfig('fontFamily', font)
}

// ── Sliders ──
type SliderKey = 'fontSize' | 'pageWidth' | 'lineHeight' | 'paragraphSpacing'

interface SliderConfig {
  key: SliderKey
  label: string
  min: number
  max: number
  step: number
  suffix: string
  format?: (v: number) => string
  id: string
}

const sliderIds: SliderConfig[] = [
  { key: 'fontSize', label: '字号', min: 16, max: 40, step: 1, suffix: '', id: useId() },
  { key: 'pageWidth', label: '宽度', min: 520, max: 1200, step: 20, suffix: '', id: useId() },
  {
    key: 'lineHeight',
    label: '行距',
    min: 1.5,
    max: 2.8,
    step: 0.05,
    suffix: '',
    format: (v: number) => v.toFixed(2),
    id: useId(),
  },
  {
    key: 'paragraphSpacing',
    label: '段间距',
    min: 0.8,
    max: 2.0,
    step: 0.05,
    suffix: '',
    format: (v: number) => v.toFixed(2),
    id: useId(),
  },
]

function getSliderValue(key: SliderKey): number {
  return settingsStore.config[key] ?? 0
}

function onSliderInput(key: SliderKey, value: string) {
  const isFloat = key === 'lineHeight' || key === 'paragraphSpacing'
  const num = isFloat ? Math.round(parseFloat(value) * 100) / 100 : parseInt(value, 10)
  settingsStore.updateConfig(key, num)
}

// ── 快捷键 ──
const shortcuts = [
  { keys: 'Space', desc: '向下翻页' },
  { keys: 'J', desc: '向下滚动' },
  { keys: 'K', desc: '向上滚动' },
  { keys: '[', desc: '上一章' },
  { keys: ']', desc: '下一章' },
  { keys: 'T', desc: '切换主题' },
  { keys: 'D', desc: '日/夜间模式' },
  { keys: 'F', desc: '全屏' },
  { keys: 'Esc', desc: '关闭面板' },
]

function close() {
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <div
      class="ir-inline-backdrop"
      :class="{ 'is-visible': open }"
      aria-hidden="true"
      @click="close"
    />

    <!-- Settings Panel -->
    <aside class="ir-inline-settings" :class="{ 'is-open': open }" @click.stop>
      <div class="ir-inline-settings-inner">
        <!-- 背景主题 -->
        <div class="ir-inline-group">
          <div class="ir-inline-label">背景主题</div>
          <div class="ir-inline-theme-row">
            <button
              v-for="t in themes"
              :key="t.key"
              class="ir-inline-theme-card"
              :class="{ 'is-selected': settingsStore.config.theme === t.key }"
              @click="selectTheme(t.key as 'wechat' | 'mist' | 'night')"
            >
              <span class="ir-inline-swatch" :class="`ir-inline-swatch--${t.key}`" />
              <span class="ir-inline-theme-label">{{ t.label }}</span>
            </button>
          </div>
        </div>

        <!-- 字体 -->
        <div class="ir-inline-group">
          <div class="ir-inline-label">字体</div>
          <div class="ir-inline-font-row">
            <button
              v-for="f in fonts"
              :key="f.key"
              class="ir-inline-font-card"
              :class="{ 'is-selected': settingsStore.config.fontFamily === f.key }"
              @click="selectFont(f.key)"
            >
              {{ f.label }}
            </button>
          </div>
        </div>

        <!-- Sliders -->
        <div class="ir-inline-group">
          <div v-for="slider in sliderIds" :key="slider.key" class="ir-inline-slider-row">
            <div class="ir-inline-slider-head">
              <label :for="slider.id">{{ slider.label }}</label>
              <strong
                >{{
                  slider.format
                    ? slider.format(getSliderValue(slider.key))
                    : getSliderValue(slider.key)
                }}{{ slider.suffix }}</strong
              >
            </div>
            <input
              :id="slider.id"
              type="range"
              :min="slider.min"
              :max="slider.max"
              :step="slider.step"
              :value="getSliderValue(slider.key)"
              @input="onSliderInput(slider.key, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <!-- 快捷键 -->
        <div class="ir-inline-group ir-inline-group--kbd">
          <div class="ir-inline-label">快捷键</div>
          <div class="ir-inline-kbd-grid">
            <template v-for="s in shortcuts" :key="s.keys">
              <kbd>{{ s.keys }}</kbd>
              <span>{{ s.desc }}</span>
            </template>
          </div>
        </div>
      </div>
    </aside>
  </Teleport>
</template>

<style>
/* ── @property for smooth transitions ── */
/* (registered in reader-content.css) */

/* ── Backdrop ── */
.ir-inline-backdrop {
  position: fixed;
  inset: 0;
  z-index: 31;
  background: light-dark(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.24));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.ir-inline-backdrop.is-visible {
  opacity: 1;
  pointer-events: auto;
}

/* ── Settings Panel ── */
.ir-inline-settings {
  position: fixed;
  top: calc(88px + env(safe-area-inset-top, 0px));
  right: calc(20px + env(safe-area-inset-right, 0px));
  z-index: 32;
  width: min(348px, calc(100vw - 32px));
  max-height: calc(100vh - 140px);
  border-radius: 20px;
  background: var(--ir-panel-elevated, rgba(253, 251, 247, 0.92));
  border: 1px solid var(--ir-border, rgba(100, 140, 118, 0.15));
  box-shadow:
    var(--ir-shadow-lg, 0 16px 40px rgba(0, 0, 0, 0.1)),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(16px) saturate(1.08);
  -webkit-backdrop-filter: blur(16px) saturate(1.08);
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-12px) scale(0.96);
  transition:
    opacity 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ir-inline-settings.is-open {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.ir-inline-settings-inner {
  padding: 20px;
  max-height: calc(100vh - 180px);
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--ir-panel-strong, rgba(247, 250, 244, 0.82));
}

/* ── Groups ── */
.ir-inline-group + .ir-inline-group {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--ir-divider, rgba(100, 140, 118, 0.13));
}

.ir-inline-label {
  margin-bottom: 12px;
  color: var(--ir-muted, #4d6358);
  font-size: 11px;
  letter-spacing: 0.08em;
  font-weight: 600;
}

/* ── Theme Cards ── */
.ir-inline-theme-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.ir-inline-theme-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding: 10px 6px 8px;
  border-radius: 14px;
  border: 1px solid var(--ir-surface-stroke, rgba(95, 140, 117, 0.13));
  background: var(--ir-card-bg, rgba(255, 255, 255, 0.52));
  color: var(--ir-text, #1c2e24);
  cursor: pointer;
  font: inherit;
  text-align: center;
  position: relative;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.2s ease;
}

.ir-inline-theme-card:hover {
  border-color: var(--ir-accent, #5c8e76);
  background: var(--ir-panel-hover, rgba(251, 253, 248, 0.9));
  transform: translateY(-2px);
  box-shadow: var(--ir-shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.05));
}

.ir-inline-theme-card:focus-visible {
  outline: 2px solid var(--ir-accent, #5c8e76);
  outline-offset: 2px;
}

.ir-inline-theme-card.is-selected {
  border-color: var(--ir-accent, #5c8e76);
  background: var(--ir-panel-hover, rgba(251, 253, 248, 0.9));
  box-shadow:
    inset 0 0 0 1px var(--ir-accent-soft, rgba(92, 142, 118, 0.1)),
    var(--ir-shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.05)),
    0 0 12px var(--ir-accent-glow, rgba(92, 142, 118, 0.18));
}

/* Ripple */
.ir-inline-theme-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: 14px;
  background: var(--ir-ripple, rgba(92, 142, 118, 0.12));
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ir-inline-theme-card:active::after {
  opacity: 1;
}

/* Theme swatches */
.ir-inline-swatch {
  width: 100%;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(95, 143, 120, 0.1);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.ir-inline-swatch--wechat {
  background:
    radial-gradient(circle at top, rgba(95, 143, 120, 0.16), transparent 54%),
    linear-gradient(180deg, #f7faf2, #edf1e7 54%, #e6ece2);
}

.ir-inline-swatch--mist {
  background:
    radial-gradient(circle at top, rgba(109, 143, 136, 0.12), transparent 54%),
    linear-gradient(180deg, #f9f7f3, #ebe8e0 54%, #e3e0d9);
}

.ir-inline-swatch--night {
  background:
    radial-gradient(circle at top, rgba(118, 162, 143, 0.08), transparent 54%),
    linear-gradient(180deg, #282c2f, #151718 54%, #0f1112);
}

.ir-inline-theme-label {
  font-size: 12px;
  line-height: 1.3;
  font-weight: 600;
}

/* ── Font Cards ── */
.ir-inline-font-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.ir-inline-font-card {
  padding: 10px 6px;
  border-radius: 10px;
  border: 1px solid var(--ir-surface-stroke, rgba(95, 140, 117, 0.13));
  background: var(--ir-card-bg, rgba(255, 255, 255, 0.52));
  color: var(--ir-text, #1c2e24);
  cursor: pointer;
  font-size: 12px;
  text-align: center;
  position: relative;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ir-inline-font-card:hover {
  border-color: var(--ir-accent, #5c8e76);
  background: var(--ir-panel-hover, rgba(251, 253, 248, 0.9));
  transform: translateY(-1px);
}

.ir-inline-font-card:focus-visible {
  outline: 2px solid var(--ir-accent, #5c8e76);
  outline-offset: 2px;
}

.ir-inline-font-card.is-selected {
  border-color: var(--ir-accent, #5c8e76);
  background: var(--ir-panel-hover, rgba(251, 253, 248, 0.9));
  box-shadow: inset 0 0 0 1px var(--ir-accent-soft, rgba(92, 142, 118, 0.1));
}

/* Ripple */
.ir-inline-font-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: 10px;
  background: var(--ir-ripple, rgba(92, 142, 118, 0.12));
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ir-inline-font-card:active::after {
  opacity: 1;
}

/* ── Sliders ── */
.ir-inline-slider-row {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--ir-panel-soft, rgba(254, 254, 252, 0.68));
  border: 1px solid var(--ir-surface-stroke, rgba(95, 140, 117, 0.13));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.ir-inline-slider-row + .ir-inline-slider-row {
  margin-top: 8px;
}

.ir-inline-slider-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
}

.ir-inline-slider-head label {
  color: var(--ir-muted, #4d6358);
  font-weight: 500;
  cursor: pointer;
}

.ir-inline-slider-head strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--ir-text, #1c2e24);
}

.ir-inline-slider-row input[type='range'] {
  width: 100%;
  margin: 0;
  accent-color: var(--ir-accent, #5c8e76);
}

.ir-inline-slider-row input[type='range']::-webkit-slider-runnable-track {
  height: 5px;
  border-radius: 999px;
  background: var(--ir-progress-bg, rgba(92, 142, 118, 0.06));
}

.ir-inline-slider-row input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  margin-top: -6.5px;
  border-radius: 50%;
  border: 1px solid var(--ir-border, rgba(100, 140, 118, 0.15));
  background: var(--ir-button-bg, rgba(255, 255, 255, 0.64));
  box-shadow: var(--ir-shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.04));
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.ir-inline-slider-row input[type='range']::-webkit-slider-thumb:hover {
  box-shadow: var(--ir-shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.05));
}

.ir-inline-slider-row input[type='range']::-moz-range-track {
  height: 5px;
  border-radius: 999px;
  background: var(--ir-progress-bg, rgba(92, 142, 118, 0.06));
  border: none;
}

.ir-inline-slider-row input[type='range']::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--ir-border, rgba(100, 140, 118, 0.15));
  background: var(--ir-button-bg, rgba(255, 255, 255, 0.64));
  box-shadow: var(--ir-shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.04));
  cursor: pointer;
}

/* ── Keyboard Shortcuts ── */
.ir-inline-kbd-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 12px;
  align-items: center;
}

.ir-inline-kbd-grid kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid var(--ir-border, rgba(100, 140, 118, 0.15));
  background: var(--ir-button-bg, rgba(255, 255, 255, 0.64));
  color: var(--ir-text, #1c2e24);
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  box-shadow:
    var(--ir-shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.04)),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.ir-inline-kbd-grid span {
  font-size: 11px;
  color: var(--ir-muted, #4d6358);
}

/* ── Responsive ── */
@media (max-width: 1180px) {
  .ir-inline-settings {
    top: auto;
    right: calc(16px + env(safe-area-inset-right, 0px));
    bottom: calc(96px + env(safe-area-inset-bottom, 0px));
    max-height: 50vh;
  }
}

@media (max-width: 760px) {
  .ir-inline-backdrop {
    background: light-dark(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.32));
  }

  .ir-inline-settings {
    top: calc(124px + env(safe-area-inset-top, 0px));
    left: 12px;
    right: 12px;
    width: auto;
    max-height: 62vh;
    border-radius: 20px 20px 16px 16px;
  }
}

@media (max-width: 400px) {
  .ir-inline-font-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .ir-inline-group--kbd {
    display: none;
  }
}

/* ── Accessibility: Reduced Motion ── */
@media (prefers-reduced-motion: reduce) {
  .ir-inline-settings {
    transition-duration: 0.01ms;
  }
}

/* ── Forced Colors — Windows High Contrast Mode ── */
@media (forced-colors: active) {
  .ir-inline-settings {
    border: 2px solid ButtonText;
    box-shadow: none;
  }

  .ir-inline-theme-card,
  .ir-inline-font-card,
  .ir-inline-slider-row {
    border: 1px solid ButtonText;
    box-shadow: none;
  }

  .ir-inline-theme-card.is-selected,
  .ir-inline-font-card.is-selected {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }
}
</style>
