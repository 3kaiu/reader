import type { ReaderNavigationProps } from './reader-navigation-types'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'

export interface ReaderToolbarBottomPanelProps {
  readingProgress: number
  navigationProps: ReaderNavigationProps
  actionProps: ReaderToolbarBottomActionsProps
}
