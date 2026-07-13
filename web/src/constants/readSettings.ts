import type { ChineseConvert, FontFamily, ReaderTheme } from '@/types/settings'

export const READ_SETTINGS_THEME_OPTIONS: Array<{
  key: ReaderTheme
  label: string
  color: string
  textColor?: string
}> = [
  { key: 'wechat', label: '浅纸绿', color: '#edf1e7' },
  { key: 'mist', label: '暖青灰', color: '#ebe8e0' },
  { key: 'night', label: '夜间黑', color: '#151718', textColor: '#bcc6c1' },
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
