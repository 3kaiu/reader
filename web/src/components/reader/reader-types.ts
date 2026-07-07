// ─── 本文件由 reader-components.types.ts 合并生成 ──────
// 包含所有 reader 子组件的 prop 和 emit 类型定义
// 导入方式: import type { XxxProps, XxxEmits } from './reader-types'

import type { ReaderLoadedChapter } from './content-chapter-types'
import type { ReaderContentStyle, ReaderKeyboardShortcut } from '@/composables/reader/shared-types'
import type { Book, Chapter } from '@/types/book'

// ═══════════════════════════════════════════════════════
// Prop types
// ═══════════════════════════════════════════════════════

export interface ReaderContentProps {
  contentStyle: ReaderContentStyle
  loadedChapters: ReaderLoadedChapter[]
  isParsing: boolean
  isLoadingMore: boolean
  hasNextChapter: boolean
  isFullscreen: boolean
  formattedTime: string
  paragraphSpacing: number
  loadError?: string | null
  loadErrorDetails?: string | null
}

export interface ReaderContentViewportProps {
  scrollContentProps: ReaderScrollContentProps
  isFullscreen: boolean
  formattedTime: string
}

export interface ReaderErrorStateProps {
  error: string
  errorDetails?: string | null
}

export interface ReaderKeyboardHelpDialogProps {
  shortcutItems: ReaderKeyboardShortcut[]
}

export interface ReaderKeyboardHelpOverlayProps {
  open: boolean
  shortcuts: ReaderKeyboardShortcut[]
}

export interface ReaderKeyboardShortcutItemProps {
  shortcut: ReaderKeyboardShortcut
}

export interface ReaderModalsProps {
  showCatalog: boolean
  showSettings: boolean
  showSourcePicker: boolean
  showBookInfo: boolean
  showKeyboardHelp: boolean
  book?: Book | null
  chapters?: Chapter[]
  currentInd?: number
  catalogLoading?: boolean
  isCached?: (index: number) => boolean
  isDownloading?: boolean
  downloadProgress?: { current: number; total: number }
  keyboardShortcuts: ReaderKeyboardShortcut[]
}

export interface ReaderNavigationProps {
  currentChapterIndex: number
  totalChapters: number
  hasPrevChapter: boolean
  hasNextChapter: boolean
  onPrev?: () => void
  onNext?: () => void
}

export interface ReaderScrollChapterListProps {
  loadedChapters: ReaderLoadedChapter[]
  layoutVersion: string
  highlightContent: (content: string | undefined) => string
  handleContentClick: (event: MouseEvent) => void
}

export interface ReaderScrollChapterProps {
  chapter: ReaderLoadedChapter
  highlightContent: (content: string | undefined) => string
  handleContentClick: (event: MouseEvent) => void
}

export interface ReaderScrollContentProps {
  contentStyle: ReaderContentStyle
  loadedChapters: ReaderLoadedChapter[]
  isParsing: boolean
  isLoadingMore: boolean
  hasNextChapter: boolean
  paragraphSpacing: number
  loadError?: string | null
  loadErrorDetails?: string | null
  highlightContent: (content: string | undefined) => string
  handleContentClick: (event: MouseEvent) => void
}

export interface ReaderScrollLoadActionsProps {
  loadError?: string | null
  loadErrorDetails?: string | null
  onLoadNextChapter: () => void
  onRetryLoad: () => void
}

export interface ReaderScrollLoadStateProps {
  hasLoadedChapters: boolean
  isParsing: boolean
  isLoadingMore: boolean
  hasNextChapter: boolean
  loadError?: string | null
  loadErrorDetails?: string | null
}

export interface ReaderToolbarBottomActionsProps {
  isNightMode: boolean
  isEyeCareEnabled: boolean
  contentIssue?: string | null
}

export interface ReaderToolbarBottomBarProps {
  show: boolean
  zenMode: boolean
  currentChapterIndex: number
  totalChapters: number
  hasPrevChapter: boolean
  hasNextChapter: boolean
  isNightMode: boolean
  isEyeCareEnabled: boolean
  contentIssue?: string | null
  onToggleDayNight?: () => void
  onToggleSettings?: () => void
  onToggleEyeCare?: () => void
  onToggleZenMode?: () => void
  onRefresh?: () => void
  onPrevChapter?: () => void
  onNextChapter?: () => void
  onOpenSourcePicker?: () => void
  onOpenBookInfo?: () => void
}

export interface ReaderToolbarBottomPanelProps {
  readingProgress: number
  navigationProps: ReaderNavigationProps
  actionProps: ReaderToolbarBottomActionsProps
  onToggleDayNight?: () => void
  onToggleSettings?: () => void
  onToggleEyeCare?: () => void
  onToggleZenMode?: () => void
  onRefresh?: () => void
  onPrevChapter?: () => void
  onNextChapter?: () => void
  onOpenSourcePicker?: () => void
  onOpenBookInfo?: () => void
}

export interface ReaderToolbarPanelsProps {
  topBarProps: ReaderToolbarTopBarProps
  bottomBarProps: ReaderToolbarBottomBarProps
  onBack?: () => void
  onToggleCatalog?: () => void
  onToggleFullscreen?: () => void
  onToggleDayNight?: () => void
  onToggleSettings?: () => void
  onToggleEyeCare?: () => void
  onToggleZenMode?: () => void
  onRefresh?: () => void
  onPrevChapter?: () => void
  onNextChapter?: () => void
  onOpenSourcePicker?: () => void
  onOpenBookInfo?: () => void
}

export interface ReaderToolbarProps {
  show: boolean
  zenMode: boolean
  bookName?: string
  chapterTitle?: string
  currentChapterIndex: number
  totalChapters: number
  hasPrevChapter: boolean
  hasNextChapter: boolean
  isNightMode: boolean
  isFullscreen: boolean
  isEyeCareEnabled: boolean
  contentIssue?: string | null
  onBack?: () => void
  onToggleCatalog?: () => void
  onToggleFullscreen?: () => void
  onToggleDayNight?: () => void
  onToggleSettings?: () => void
  onToggleEyeCare?: () => void
  onToggleZenMode?: () => void
  onRefresh?: () => void
  onPrevChapter?: () => void
  onNextChapter?: () => void
  onOpenSourcePicker?: () => void
  onOpenBookInfo?: () => void
}

export interface ReaderToolbarTopBarProps {
  show: boolean
  zenMode: boolean
  bookName?: string
  chapterTitle?: string
  isFullscreen: boolean
  onBack?: () => void
  onToggleCatalog?: () => void
  onToggleFullscreen?: () => void
}

// ═══════════════════════════════════════════════════════
// Emit types
// ═══════════════════════════════════════════════════════

export type ReaderContentEmits = {
  loadNextChapter: []
  retryLoad: []
}

export type ReaderContentViewportEmits = {
  loadNextChapter: []
  retryLoad: []
}

export type ReaderErrorStateEmits = {
  openSourcePicker: []
  retryLoad: []
}

export type ReaderKeyboardEmits = {
  'toggle-fullscreen': []
  'toggle-catalog': []
  'toggle-settings': []
  'toggle-day-night': []
  'toggle-help': []
  escape: []
}

export type ReaderKeyboardHelpDialogEmits = {
  close: []
}

export type ReaderKeyboardHelpHeaderEmits = {
  close: []
}

export type ReaderKeyboardHelpOverlayEmits = {
  'update:open': [value: boolean]
}

export type ReaderModalsEmits = {
  'update:showCatalog': [val: boolean]
  'update:showSettings': [val: boolean]
  'update:showSourcePicker': [val: boolean]
  'update:showBookInfo': [val: boolean]
  'update:showKeyboardHelp': [val: boolean]
  'select-chapter': [index: number]
  refresh: []
  'download-all': []
}

export type ReaderScrollContentEmits = {
  loadNextChapter: []
  retryLoad: []
}

export type ReaderScrollLoadStateEmits = {
  loadNextChapter: []
  retryLoad: []
}

// ═══════════════════════════════════════════════════════
// EmitFn types (用于绑定文件)
// ═══════════════════════════════════════════════════════

export type ReaderErrorStateEmitFn = <EventName extends keyof ReaderErrorStateEmits>(
  event: EventName,
  ...args: ReaderErrorStateEmits[EventName]
) => void

export type ReaderKeyboardEmitFn = <EventName extends keyof ReaderKeyboardEmits>(
  event: EventName,
  ...args: ReaderKeyboardEmits[EventName]
) => void

export type ReaderKeyboardHelpHeaderEmitFn = <
  EventName extends keyof ReaderKeyboardHelpHeaderEmits,
>(
  event: EventName,
  ...args: ReaderKeyboardHelpHeaderEmits[EventName]
) => void

export type ReaderKeyboardHelpOverlayEmitFn = <
  EventName extends keyof ReaderKeyboardHelpOverlayEmits,
>(
  event: EventName,
  ...args: ReaderKeyboardHelpOverlayEmits[EventName]
) => void

export type ReaderModalsEmitFn = <EventName extends keyof ReaderModalsEmits>(
  event: EventName,
  ...args: ReaderModalsEmits[EventName]
) => void

export type ReaderScrollLoadStateEmitFn = <EventName extends keyof ReaderScrollLoadStateEmits>(
  event: EventName,
  ...args: ReaderScrollLoadStateEmits[EventName]
) => void
  ...args: ReaderToolbarTopBarEmits[EventName]
) => void