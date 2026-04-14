import { computed } from 'vue'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'
import { createReaderToolbarBottomActionList } from './toolbar-bottom-action-list'

export type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'

export interface ReaderToolbarBottomActionsBindings extends ReaderToolbarBottomActionsProps {
  onToggleDayNight: () => void
  onToggleSettings: () => void
  onToggleEyeCare: () => void
  onToggleZenMode: () => void
  onRefresh: () => void
  onOpenSourcePicker: () => void
  onOpenBookInfo: () => void
}

export function createReaderToolbarBottomActions(
  props: ReaderToolbarBottomActionsBindings
) {
  const actionButtons = computed<ReaderToolbarBottomAction[]>(() =>
    createReaderToolbarBottomActionList(props)
  )

  return {
    actionButtons,
  }
}
