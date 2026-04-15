export type ReaderTheme = 'white' | 'paper' | 'night'

export type FontFamily = 'system' | 'heiti' | 'kaiti' | 'songti' | 'fangsong' | 'lxgw'

export type ChineseConvert = 'none' | 'toSimplified' | 'toTraditional'
export type ClientRouteKind = 'direct' | 'edge'
export type ReaderPerformanceMode = 'balanced' | 'aggressive' | 'compat'

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
