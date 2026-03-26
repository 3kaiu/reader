import type {
  ReaderContentStyle,
  ReaderKeyboardShortcut,
} from './shared-types'

export interface ReaderExperienceDisplayState {
  contentStyle: ReaderContentStyle
  isNightMode: boolean
  formattedTime: string
  keyboardShortcuts: ReaderKeyboardShortcut[]
}
