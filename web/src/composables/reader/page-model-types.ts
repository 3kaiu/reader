/**
 * Page-model types — merged from 5 individual files:
 *   page-model-chrome-options, page-model-experience-options,
 *   page-model-option-types, page-model-state-options, page-state-types
 */
import type { Ref } from 'vue'
import type {
  ReaderExperienceViewActions,
  ReaderExperienceReadingActions,
} from './experience-types'

// ── Chrome options ─────────────────────────────────────────────────
export interface ReaderPageModelChromeOptions {
  toggleToolbar(): void
  toggleCatalog(): void
  toggleSettings(): void
  toggleKeyboardHelp(): void
  handleEscape(): void
  openSourcePicker(): void
}

// ── Experience actions for page model ──────────────────────────────
export type ReaderPageExperienceActions = Pick<
  ReaderExperienceReadingActions,
  'handlePrevChapter' | 'handleNextChapter' | 'handleRefresh'
> &
  Pick<ReaderExperienceViewActions, 'toggleFullscreen' | 'toggleDayNight' | 'toggleZenMode'>

export type ReaderPageModelExperienceOptions = {
  readerExperienceActions: ReaderPageExperienceActions
}

// ── State options ──────────────────────────────────────────────────
export type ReaderPageModelStateOptions = {
  currentTheme: Readonly<Ref<string>>
  isLoading: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null | undefined>>
  errorDetails: Readonly<Ref<string | null | undefined>>
}

// ── Composite options ──────────────────────────────────────────────
export type ReaderPageModelOptions = ReaderPageModelStateOptions &
  ReaderPageModelChromeOptions &
  ReaderPageModelExperienceOptions

// ── Page state ─────────────────────────────────────────────────────
export interface ReaderPageState {
  themeClass: string
  isLoading: boolean
  error: string | null | undefined
  errorDetails: string | null | undefined
}
