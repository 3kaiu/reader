import type { ComputedRef } from 'vue'
import type {
  ReaderToolbarBottomPanelProps,
} from './toolbar-bottom-panel-prop-types'

export interface ReaderToolbarBottomBarPanelBindings
  extends ReaderToolbarBottomPanelProps {
  onToggleDayNight: () => void
  onToggleSettings: () => void
  onToggleEyeCare: () => void
  onToggleZenMode: () => void
  onRefresh: () => void
  onPrevChapter: () => void
  onNextChapter: () => void
  onOpenSourcePicker: () => void
  onOpenBookInfo: () => void
}

export interface ReaderToolbarBottomBarBindingResult {
  panelBindings: ComputedRef<ReaderToolbarBottomBarPanelBindings>
  isVisible: ComputedRef<boolean>
}
