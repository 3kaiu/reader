export interface ReaderChromeTimerActions {
  clearHideTimer: () => void
  startHideTimer: () => void
}

export interface ReaderChromeLayerActions {
  closeActiveLayer: () => boolean
}

export interface ReaderChromeDisplayActions {
  toggleToolbar: () => void
  toggleZenMode: () => void
  toggleCatalog: () => void
  openCatalog: () => void
  toggleSettings: () => void
  openSettings: () => void
  toggleKeyboardHelp: () => void
  openSourcePicker: () => void
  openBookInfo: () => void
  openDecoderSettings: () => void
  goBack: () => void
  handleEscape: () => void
}

export interface ReaderChromeActionsResult extends ReaderChromeDisplayActions {
  clearHideTimer: () => void
}
