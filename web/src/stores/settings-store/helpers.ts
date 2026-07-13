import { getLocalStorageItem, setLocalStorageItem } from '@/utils/browserStorage'
import { config as appConfig } from '@/utils/config'
import { logger } from '@/utils/logger'
import { getThemeTokens, CORE_TOKEN_KEYS } from '@/constants/theme-tokens'
import type {
  FontFamily,
  ReaderConfig,
  ReaderTheme,
  ThemeColors,
} from '@/types/settings'

const STORAGE_KEY = 'reader-settings'

const DEFAULT_READER_CONFIG: ReaderConfig = {
  theme: 'wechat',
  customColors: {
    bg: '#edf1e7',
    text: '#1f3328',
  },
  fontFamily: 'system',
  chineseConvert: 'none',
  fontSize: 18,
  fontWeight: 400,
  lineHeight: 2.0,
  paragraphSpacing: 1.6,
  pageWidth: 800,
  autoNightMode: false,
  nightModeStartHour: 20,
  nightModeEndHour: 6,
  zenMode: false,
  performanceMode: 'balanced',
  adaptivePrefetchEnabled: true,
  offlinePersistenceEnabled: true,
  wakeLockEnabled: true,
  perfTelemetrySampleRate: 0.05,
}

export const THEME_COLORS: Record<ReaderTheme, ThemeColors> = {
  wechat: { bg: '#edf1e7', text: '#1f3328' },
  mist: { bg: '#ebe8e0', text: '#25322d' },
  night: { bg: '#151718', text: '#b6c0bb' },
}

/**
 * 应用完整主题 token 到 CSS 变量
 *
 * light-dark() 路径 (Chrome 123+, FF 120+, Safari 17.5+):
 *   仅设置 color-scheme 切换，CSS 通过 light-dark() 自动选择色值
 *
 * JS fallback 路径:
 *   逐条 setProperty 设置核心 token (~24) + 切换 .ir-dark class
 */
export function applyThemeTokens(theme: ReaderTheme): void {
  const tokens = getThemeTokens(theme)
  const style = document.documentElement.style
  const isDark = theme === 'night'

  // color-scheme 始终设置 — light-dark() 和浏览器 chrome 都需要
  style.setProperty('color-scheme', isDark ? 'dark' : 'light')

  // light-dark() 检测 — 原生支持则跳过 JS setProperty，由 CSS 变量处理
  if (!CSS.supports('color', 'light-dark(red, blue)')) {
    // JS fallback: 设置核心 token
    for (const key of CORE_TOKEN_KEYS) {
      const cssVar = `--ir-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
      style.setProperty(cssVar, tokens[key])
    }
    // .ir-dark class 用于 color-mix() 衍生 token 暗色覆盖 (见 reader.vue global CSS)
    document.documentElement.classList.toggle('ir-dark', isDark)
  }

  // Update theme-color meta for mobile browser chrome
  const tm = document.querySelector('meta[name="theme-color"]')
  if (tm) tm.setAttribute('content', tokens.bg)
}

export const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  heiti: "'PingFang SC', 'Microsoft YaHei', sans-serif",
  kaiti: 'STKaiti, KaiTi, serif',
  songti: 'STSong, SimSun, serif',
  fangsong: 'FangSong, STFangsong, serif',
  lxgw: "'LXGW WenKai Screen', 'LXGW WenKai', serif",
}

export function cloneDefaultConfig(): ReaderConfig {
  return {
    ...DEFAULT_READER_CONFIG,
    customColors: { ...DEFAULT_READER_CONFIG.customColors },
  }
}

export function clampSettingValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function isInNightWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) {
    return true
  }
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour
  }
  return hour >= startHour || hour < endHour
}

export function loadPersistedConfig(): Partial<ReaderConfig> | null {
  try {
    const raw = getLocalStorageItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<ReaderConfig>) : null
  } catch (error) {
    logger.warn('Failed to load reader settings', { error })
    return null
  }
}

export function sanitizePersistedConfig(
  persisted: Partial<ReaderConfig> | null
): Partial<ReaderConfig> | null {
  if (!persisted) {
    return null
  }

  return {
    theme: persisted.theme,
    customColors: persisted.customColors
      ? {
          bg: persisted.customColors.bg ?? DEFAULT_READER_CONFIG.customColors.bg,
          text: persisted.customColors.text ?? DEFAULT_READER_CONFIG.customColors.text,
        }
      : undefined,
    fontFamily: persisted.fontFamily,
    chineseConvert: persisted.chineseConvert,
    fontSize: persisted.fontSize,
    fontWeight: persisted.fontWeight,
    lineHeight: persisted.lineHeight,
    paragraphSpacing: persisted.paragraphSpacing,
    pageWidth: persisted.pageWidth,
    autoNightMode: persisted.autoNightMode,
    nightModeStartHour: persisted.nightModeStartHour,
    nightModeEndHour: persisted.nightModeEndHour,
    zenMode: persisted.zenMode,
    performanceMode: persisted.performanceMode,
    adaptivePrefetchEnabled: persisted.adaptivePrefetchEnabled,
    offlinePersistenceEnabled: persisted.offlinePersistenceEnabled,
    wakeLockEnabled: persisted.wakeLockEnabled,
    perfTelemetrySampleRate: persisted.perfTelemetrySampleRate,
  }
}

export function persistConfig(readerConfig: ReaderConfig, language: string): void {
  try {
    setLocalStorageItem(STORAGE_KEY, JSON.stringify(readerConfig))
    appConfig.set('ui.language', language)
    appConfig.set('reading.fontSize', readerConfig.fontSize)
  } catch (error) {
    logger.warn('Failed to persist reader settings', { error })
  }
}
