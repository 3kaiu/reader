import type { ReaderExperienceToolbarActions } from './reader-experience-toolbar-action-types'
import type { ReaderToolbarProps } from './toolbar-prop-types'

export function createReaderExperienceToolbarPropsBindings(
  toolbarProps: ReaderToolbarProps,
  actions: ReaderExperienceToolbarActions,
  handleToggleEyeCare: () => void
) {
  return {
    ...toolbarProps,
    onBack: actions.goBack,
    onToggleCatalog: actions.openCatalog,
    onToggleFullscreen: actions.toggleFullscreen,
    onToggleDayNight: actions.toggleDayNight,
    onToggleSettings: actions.openSettings,
    onToggleEyeCare: handleToggleEyeCare,
    onToggleZenMode: actions.toggleZenMode,
    onRefresh: actions.handleRefresh,
    onPrevChapter: actions.handlePrevChapter,
    onNextChapter: actions.handleNextChapter,
    onOpenSourcePicker: actions.openSourcePicker,
    onOpenBookInfo: actions.openBookInfo,
  }
}
