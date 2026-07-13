export type ReaderTheme = 'wechat' | 'mist' | 'night'

export type FontFamily = 'system' | 'heiti' | 'kaiti' | 'songti' | 'fangsong' | 'lxgw'

export type ChineseConvert = 'none' | 'toSimplified' | 'toTraditional'
export type ReaderPerformanceMode = 'balanced' | 'aggressive' | 'compat'

/**
 * 完整阅读器设计 token 集 — oklch 色彩空间，每主题 ~40 tokens
 * 参考 69shuba Immersive Reader 微信读书风格设计
 */
export type ThemeTokens = {
  label: string
  bg: string
  panel: string
  panelAlt: string
  panelElevated: string
  text: string
  textBody: string
  muted: string
  faint: string
  placeholder: string
  border: string
  borderFocus: string
  accent: string
  accentSoft: string
  accentGlow: string
  shadowXs: string
  shadowSm: string
  shadowMd: string
  shadowLg: string
  panelStrong: string
  panelSoft: string
  panelHover: string
  surfaceStroke: string
  selection: string
  progressBar: string
  progressBg: string
  progressDone: string
  glowTop: string
  glowSide: string
  glowBottom: string
  washTop: string
  washMid: string
  washLow: string
  grainSide: string
  grainTint: string
  grainTintLow: string
  headingColor: string
  dividerColor: string
  cardBg: string
  buttonBg: string
  ripple: string
}

/**
 * 兼容旧版 ThemeColors 类型 — 精简版，仅含 bg/text
 */
export type ThemeColors = {
  bg: string
  text: string
}

export type ReaderConfig = {
  theme: ReaderTheme
  customColors: ThemeColors
  fontFamily: FontFamily
  chineseConvert: ChineseConvert
  fontSize: number
  fontWeight: number
  lineHeight: number
  paragraphSpacing: number
  pageWidth: number
  autoNightMode: boolean
  nightModeStartHour: number
  nightModeEndHour: number
  zenMode: boolean
  performanceMode: ReaderPerformanceMode
  adaptivePrefetchEnabled: boolean
  offlinePersistenceEnabled: boolean
  wakeLockEnabled: boolean
  perfTelemetrySampleRate: number
}
