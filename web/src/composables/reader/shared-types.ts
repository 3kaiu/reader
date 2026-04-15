import type { CSSProperties } from 'vue'

export type ReaderToast = (payload: {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  duration?: number
}) => unknown

export type ReaderContentInstance = {
  $el?: Element
} | null

export type ReaderKeyboardShortcut = {
  key: string
  desc: string
}

export type ReaderContentStyle = Record<string, string | number>
export type ReaderThemeStyle = CSSProperties
