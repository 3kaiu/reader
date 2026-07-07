import type { ReaderContentInstance } from './shared-types'
import type {
  ReaderExperienceActions,
  ReaderExperienceViewActions,
  ReaderExperienceModalActions,
  ReaderExperienceReadingActions,
  ReaderExperienceModelHandlerOptions,
} from './experience-types'
import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderExperienceModelVisibilityOptions } from './experience-model-visibility-types'

// ── View Actions ──────────────────────────────────────────────────────

type ViewActionOptions = Pick<ReaderExperienceModelServiceOptions, 'contentRef'> &
  Pick<
    ReaderExperienceModelHandlerOptions,
    'goBack' | 'openCatalog' | 'toggleFullscreen' | 'toggleDayNight'
    | 'openSettings' | 'toggleZenMode' | 'openSourcePicker' | 'openBookInfo'
  >

function createViewActions(options: ViewActionOptions): ReaderExperienceViewActions {
  return {
    bindContentRef(instance) {
      options.contentRef.value = instance as ReaderContentInstance
    },
    goBack: options.goBack,
    openCatalog: options.openCatalog,
    toggleFullscreen: options.toggleFullscreen,
    toggleDayNight: options.toggleDayNight,
    openSettings: options.openSettings,
    toggleZenMode: options.toggleZenMode,
    openSourcePicker: options.openSourcePicker,
    openBookInfo: options.openBookInfo,
  }
}

// ── Reading Actions ───────────────────────────────────────────────────

type ReadingActionOptions = Pick<
  ReaderExperienceModelHandlerOptions,
  'handleRefresh' | 'handlePrevChapter' | 'handleNextChapter' | 'handleSelectChapter'
>

function createReadingActions(options: ReadingActionOptions): ReaderExperienceReadingActions {
  return {
    handleRefresh: options.handleRefresh,
    handlePrevChapter: options.handlePrevChapter,
    handleNextChapter: options.handleNextChapter,
    handleSelectChapter: options.handleSelectChapter,
  }
}

// ── Modal Actions ─────────────────────────────────────────────────────

function createModalActions(
  options: ReaderExperienceModelVisibilityOptions
): ReaderExperienceModalActions {
  return {
    setShowCatalog(value) { options.showCatalog.value = value },
    setShowSettings(value) { options.showSettings.value = value },
    setShowSourcePicker(value) { options.showSourcePicker.value = value },
    setShowBookInfo(value) { options.showBookInfo.value = value },
    setShowKeyboardHelp(value) { options.showKeyboardHelp.value = value },
  }
}

// ── Entry Point ───────────────────────────────────────────────────────

type ExperienceActionOptions = Pick<ReaderExperienceModelServiceOptions, 'contentRef'> &
  ReaderExperienceModelVisibilityOptions &
  ReaderExperienceModelHandlerOptions

export function createReaderExperienceActions(
  options: ExperienceActionOptions
): ReaderExperienceActions {
  return {
    ...createViewActions(options),
    ...createReadingActions(options),
    ...createModalActions(options),
  }
}