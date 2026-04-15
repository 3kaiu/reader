import type { createReaderBookInfoModalBindings } from './reader-modals-book-info-bindings'
import type { createReaderChapterListModalBindings } from './reader-modals-chapter-list-bindings'
import type { createReaderKeyboardHelpModalBindings } from './reader-modals-keyboard-help-bindings'
import type { createReaderSettingsModalBindings } from './reader-modals-settings-bindings'
import type { createReaderSourcePickerModalBindings } from './reader-modals-source-picker-bindings'

export interface ReaderModalsPanelBindings {
  chapterListBindings: ReturnType<typeof createReaderChapterListModalBindings>
  settingsBindings: ReturnType<typeof createReaderSettingsModalBindings>
  sourcePickerBindings: ReturnType<typeof createReaderSourcePickerModalBindings>
  bookInfoBindings: ReturnType<typeof createReaderBookInfoModalBindings>
  keyboardHelpBindings: ReturnType<typeof createReaderKeyboardHelpModalBindings>
}
