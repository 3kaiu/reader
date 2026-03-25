export type ReaderTheme =
  | 'white'
  | 'paper'
  | 'sepia'
  | 'gray'
  | 'green'
  | 'night'
  | 'custom'

export type FontFamily =
  | 'system'
  | 'heiti'
  | 'kaiti'
  | 'songti'
  | 'fangsong'
  | 'lxgw'

export type ChineseConvert = 'none' | 'toSimplified' | 'toTraditional'
export type ClientRouteKind = 'direct' | 'edge'

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
}
