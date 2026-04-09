import {
  getLocalStorageItem,
  setLocalStorageItem,
} from '@/utils/browserStorage'
import { config as appConfig } from '@/utils/config'
import { logger } from '@/utils/logger'
import type {
  ClientRouteKind,
  FontFamily,
  ReaderConfig,
  ReaderTheme,
  ThemeColors,
} from '@/types/settings'

const STORAGE_KEY = 'reader-settings'

export const DEFAULT_READER_CONFIG: ReaderConfig = {
  theme: 'paper',
  customColors: {
    bg: '#FAF7ED',
    text: '#333333',
  },
  fontFamily: 'system',
  chineseConvert: 'none',
  fontSize: 18,
  fontWeight: 400,
  lineHeight: 1.8,
  paragraphSpacing: 1.2,
  pageWidth: 800,
  autoNightMode: false,
  nightModeStartHour: 20,
  nightModeEndHour: 6,
  zenMode: false,
  performanceMode: 'balanced',
}

export const THEME_COLORS: Record<Exclude<ReaderTheme, 'custom'>, ThemeColors> = {
  white: { bg: '#FFFFFF', text: '#242424' },
  paper: { bg: '#FAF7ED', text: '#38342F' },
  sepia: { bg: '#EFE6D5', text: '#4A3B32' },
  gray: { bg: '#F2F3F5', text: '#2B2B2B' },
  green: { bg: '#E6F0E6', text: '#2E362C' },
  night: { bg: '#1C1C1E', text: '#A1A1AA' },
}

export const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  heiti: "'PingFang SC', 'Microsoft YaHei', sans-serif",
  kaiti: 'STKaiti, KaiTi, serif',
  songti: 'STSong, SimSun, serif',
  fangsong: 'FangSong, STFangsong, serif',
  lxgw: "'LXGW WenKai Screen', 'LXGW WenKai', serif",
}

export const CLIENT_ROUTE_KINDS: ClientRouteKind[] = ['direct', 'edge']

export function cloneDefaultConfig(): ReaderConfig {
  return {
    ...DEFAULT_READER_CONFIG,
    customColors: { ...DEFAULT_READER_CONFIG.customColors },
  }
}

export function clampSettingValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function isInNightWindow(
  hour: number,
  startHour: number,
  endHour: number
): boolean {
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

export function formatRouteShare(value?: number): string {
  if (value == null || Number.isNaN(value)) {
    return '0%'
  }
  return `${value.toFixed(2)}%`
}

export function formatRouteLatency(value?: number): string {
  if (value == null || Number.isNaN(value)) {
    return '-'
  }
  return `${value.toFixed(0)}ms`
}
