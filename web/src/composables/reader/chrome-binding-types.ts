import type { ReaderChromeActionsResult } from './chrome-actions-result-types'
import type { ReaderChromeState } from './chrome-state'

export interface ReaderChromeBindingState {
  showToolbar: ReaderChromeState['showToolbar']
  showCatalog: ReaderChromeState['showCatalog']
  showSettings: ReaderChromeState['showSettings']
  showSourcePicker: ReaderChromeState['showSourcePicker']
  showBookInfo: ReaderChromeState['showBookInfo']
  showKeyboardHelp: ReaderChromeState['showKeyboardHelp']
}

export interface ReaderChromeBindingsResult
  extends Omit<ReaderChromeActionsResult, 'clearHideTimer'>, ReaderChromeBindingState {}
