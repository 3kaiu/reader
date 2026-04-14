import { computed } from 'vue'
import { createReaderToolbarBottomBarPropsBindings } from './toolbar-bottom-bar-props-bindings'
import type { ReaderToolbarPanelsProps } from './toolbar-panels-prop-types'
import type { ReaderToolbarProps } from './toolbar-prop-types'
import { createReaderToolbarTopBarPropsBindings } from './toolbar-top-bar-props-bindings'

export function createReaderToolbarPanelsPropsBindings(props: ReaderToolbarProps) {
  const topBarProps = createReaderToolbarTopBarPropsBindings(props)
  const bottomBarProps = createReaderToolbarBottomBarPropsBindings(props)

  return computed<ReaderToolbarPanelsProps>(() => ({
    topBarProps: topBarProps.value,
    bottomBarProps: bottomBarProps.value,
  }))
}
