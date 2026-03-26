import type { ComputedRef } from 'vue'
import type { ReaderToolbarBottomBarProps } from './toolbar-bottom-bar-prop-types'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

export interface ReaderToolbarPanelsTopBarBindings
  extends ReaderToolbarTopBarProps {
  onBack: () => void
  onToggleCatalog: () => void
  onToggleFullscreen: () => void
}

export interface ReaderToolbarPanelsBottomBarBindings
  extends ReaderToolbarBottomBarProps {
  onToggleDayNight: () => void
  onToggleSettings: () => void
  onToggleEyeCare: () => void
  onToggleZenMode: () => void
  onRefresh: () => void
  onPrevChapter: () => void
  onNextChapter: () => void
  onOpenSourcePicker: () => void
  onOpenBookInfo: () => void
  onToggleDecoder: (enabled: boolean) => void
  onOpenDecoderSettings: () => void
}

export interface ReaderToolbarPanelsBindingResult {
  topBarBindings: ComputedRef<ReaderToolbarPanelsTopBarBindings>
  bottomBarBindings: ComputedRef<ReaderToolbarPanelsBottomBarBindings>
}
