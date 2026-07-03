/**
 * Experience types — merged from individual type-only files (13 files → 1).
 */
import type { useEyeCare } from '@/composables/useEyeCare'
import type { useReaderStore } from '@/stores/reader'
import type { useSettingsStore } from '@/stores/settings'
import type { createReaderExperienceContentProps } from './experience-content'
import type { createReaderExperienceModalProps } from './experience-modal'
import type { createReaderExperienceToolbarProps } from './experience-toolbar'
import type { ReaderKeyboardShortcut, ReaderContentStyle } from './shared-types'

// ── State: Visibility ──────────────────────────────────────────────
export interface ReaderExperienceVisibilityState {
  showToolbar: boolean
  showCatalog: boolean
  showSettings: boolean
  showSourcePicker: boolean
  showBookInfo: boolean
  showKeyboardHelp: boolean
  isFullscreen: boolean
}

// ── State: Display ─────────────────────────────────────────────────
export interface ReaderExperienceDisplayState {
  contentStyle: ReaderContentStyle
  isNightMode: boolean
  formattedTime: string
  keyboardShortcuts: ReaderKeyboardShortcut[]
}

// ── State: Service ─────────────────────────────────────────────────
export interface ReaderExperienceServiceState {
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  eyeCare: ReturnType<typeof useEyeCare>
  activeBookUrl: string
}

// ── State: Composite ───────────────────────────────────────────────
export type ReaderExperienceState = ReaderExperienceServiceState &
  ReaderExperienceVisibilityState &
  ReaderExperienceDisplayState

// ── Actions: View ──────────────────────────────────────────────────
export interface ReaderExperienceViewActions {
  bindContentRef(instance: unknown): void
  goBack(): void
  openCatalog(): void
  toggleFullscreen(): void
  toggleDayNight(): void
  openSettings(): void
  toggleZenMode(): void
  openSourcePicker(): void
  openBookInfo(): void
}

// ── Actions: Reading ───────────────────────────────────────────────
export interface ReaderExperienceReadingActions {
  handleRefresh(): void | Promise<void>
  handlePrevChapter(): void | Promise<void>
  handleNextChapter(): void | Promise<void>
  handleSelectChapter(index: number): void | Promise<void>
}

// ── Actions: Modal ─────────────────────────────────────────────────
export interface ReaderExperienceModalActions {
  setShowCatalog(value: boolean): void
  setShowSettings(value: boolean): void
  setShowSourcePicker(value: boolean): void
  setShowBookInfo(value: boolean): void
  setShowKeyboardHelp(value: boolean): void
}

// ── Actions: Composite ─────────────────────────────────────────────
export type ReaderExperienceActions = ReaderExperienceViewActions &
  ReaderExperienceReadingActions &
  ReaderExperienceModalActions

// ── Actions: Binding variant ───────────────────────────────────────
export type ReaderExperienceBindingActions = ReaderExperienceViewActions &
  ReaderExperienceReadingActions &
  ReaderExperienceModalActions

// ── Binding: State ─────────────────────────────────────────────────
export type ReaderExperienceBindingState = ReaderExperienceServiceState &
  ReaderExperienceVisibilityState &
  ReaderExperienceDisplayState

// ── Binding: Props ─────────────────────────────────────────────────
export interface ReaderExperienceBindingProps {
  state: ReaderExperienceBindingState
  actions: ReaderExperienceBindingActions
}

// ── Binding: Assist result ─────────────────────────────────────────
export interface ReaderExperienceBindingAssistResult {
  handleToggleEyeCare: () => void
}

// ── Binding: Props result ──────────────────────────────────────────
export interface ReaderExperienceBindingPropsResult {
  toolbarProps: ReturnType<typeof createReaderExperienceToolbarProps>
  contentProps: ReturnType<typeof createReaderExperienceContentProps>
  modalProps: ReturnType<typeof createReaderExperienceModalProps>
}

export type ReaderExperienceBindingResult = ReaderExperienceBindingPropsResult &
  ReaderExperienceBindingAssistResult

// ── Handler options ────────────────────────────────────────────────
export type ReaderExperienceModelHandlerOptions = {
  goBack: ReaderExperienceViewActions['goBack']
  openCatalog: ReaderExperienceViewActions['openCatalog']
  toggleFullscreen: ReaderExperienceViewActions['toggleFullscreen']
  toggleDayNight: ReaderExperienceViewActions['toggleDayNight']
  openSettings: ReaderExperienceViewActions['openSettings']
  toggleZenMode: ReaderExperienceViewActions['toggleZenMode']
  openSourcePicker: ReaderExperienceViewActions['openSourcePicker']
  openBookInfo: ReaderExperienceViewActions['openBookInfo']
  handleRefresh: ReaderExperienceReadingActions['handleRefresh']
  handlePrevChapter: ReaderExperienceReadingActions['handlePrevChapter']
  handleNextChapter: ReaderExperienceReadingActions['handleNextChapter']
  handleSelectChapter: ReaderExperienceReadingActions['handleSelectChapter']
}
