import type {
  ReaderChromeBindingState,
} from './chrome-binding-types'
import type { ReaderChromeState } from './chrome-state'

export function createReaderChromeBindingState(
  state: ReaderChromeState,
): ReaderChromeBindingState {
  return {
    showToolbar: state.showToolbar,
    showCatalog: state.showCatalog,
    showSettings: state.showSettings,
    showSourcePicker: state.showSourcePicker,
    showBookInfo: state.showBookInfo,
    showKeyboardHelp: state.showKeyboardHelp,
    showDecoderSettings: state.showDecoderSettings,
  }
}
