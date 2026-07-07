import { computed } from 'vue'
import type { ReaderToolbarProps } from './toolbar-prop-types'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

export function createReaderToolbarTopBarPropsBindings(props: ReaderToolbarProps) {
  return computed<ReaderToolbarTopBarProps>(() => ({
    show: props.show,
    zenMode: props.zenMode,
    bookName: props.bookName,
    chapterTitle: props.chapterTitle,
    isFullscreen: props.isFullscreen,
    onBack: props.onBack,
    onToggleCatalog: props.onToggleCatalog,
    onToggleFullscreen: props.onToggleFullscreen,
  }))
}
