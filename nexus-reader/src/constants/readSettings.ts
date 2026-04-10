import type { ChineseConvert, FontFamily, ReaderTheme } from '@/types/settings'

export const READ_SETTINGS_THEME_OPTIONS: Array<{
  key: ReaderTheme
  label: string
  color: string
  textColor?: string
}> = [
  { key: 'white', label: '白', color: '#FFFFFF' },
  { key: 'paper', label: '护眼', color: '#FAF7ED' },
  { key: 'night', label: '夜间', color: '#1C1C1E', textColor: '#A1A1AA' },
]

export const READ_SETTINGS_FONT_OPTIONS: Array<{
  key: FontFamily
  label: string
}> = [
  { key: 'system', label: '系统' },
  { key: 'heiti', label: '黑体' },
  { key: 'kaiti', label: '楷体' },
  { key: 'songti', label: '宋体' },
  { key: 'fangsong', label: '仿宋' },
  { key: 'lxgw', label: '霞鹭文楷' },
]

export const READ_SETTINGS_CHINESE_OPTIONS: Array<{
  key: ChineseConvert
  label: string
}> = [
  { key: 'none', label: '不转换' },
  { key: 'toSimplified', label: '转简体' },
  { key: 'toTraditional', label: '转繁体' },
]

export const READ_SETTINGS_FONT_WEIGHTS = [300, 400, 500, 600, 700] as const
