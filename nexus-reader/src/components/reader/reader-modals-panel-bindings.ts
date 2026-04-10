import { createReaderBookInfoModalBindings } from './reader-modals-book-info-bindings'
import { createReaderChapterListModalBindings } from './reader-modals-chapter-list-bindings'
import { createReaderKeyboardHelpModalBindings } from './reader-modals-keyboard-help-bindings'
import { createReaderSettingsModalBindings } from './reader-modals-settings-bindings'
import { createReaderSourcePickerModalBindings } from './reader-modals-source-picker-bindings'
import type { ReaderModalsEmitFn } from './reader-modals-emit-types'
import type { ReaderModalsPanelBindings } from './reader-modals-panel-binding-types'
import type { ReaderModalsProps } from './reader-modals-prop-types'

export function createReaderModalsPanelBindings(
  props: ReaderModalsProps,
  emit: ReaderModalsEmitFn
): ReaderModalsPanelBindings {
  return {
    chapterListBindings: createReaderChapterListModalBindings(props, emit),
    settingsBindings: createReaderSettingsModalBindings(props, emit),
    sourcePickerBindings: createReaderSourcePickerModalBindings(props, emit),
    bookInfoBindings: createReaderBookInfoModalBindings(props, emit),
    keyboardHelpBindings: createReaderKeyboardHelpModalBindings(props, emit),
  }
}
