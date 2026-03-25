import type { ReaderChromeActionsResult } from './chrome-display-types'
import type { ReaderChromeState } from './chrome-state'

export interface ReaderChromeBindingsResult
  extends Omit<ReaderChromeActionsResult, 'clearHideTimer'> {
  showToolbar: ReaderChromeState['showToolbar']
  showCatalog: ReaderChromeState['showCatalog']
  showSettings: ReaderChromeState['showSettings']
  showSourcePicker: ReaderChromeState['showSourcePicker']
  showBookInfo: ReaderChromeState['showBookInfo']
  showKeyboardHelp: ReaderChromeState['showKeyboardHelp']
  showDecoderSettings: ReaderChromeState['showDecoderSettings']
}

export function createReaderChromeBindings(
  state: ReaderChromeState,
  actions: ReaderChromeActionsResult,
): ReaderChromeBindingsResult {
  const { clearHideTimer, ...displayActions } = actions

  return {
    showToolbar: state.showToolbar,
    showCatalog: state.showCatalog,
    showSettings: state.showSettings,
    showSourcePicker: state.showSourcePicker,
    showBookInfo: state.showBookInfo,
    showKeyboardHelp: state.showKeyboardHelp,
    showDecoderSettings: state.showDecoderSettings,
    ...displayActions,
  }
}
