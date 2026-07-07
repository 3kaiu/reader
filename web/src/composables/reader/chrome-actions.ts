import type { ReaderChromeActionOptions } from './chrome-option-types'
import type { ReaderChromeState } from './chrome-state'

// ── Types ─────────────────────────────────────────────────────────────

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
  goBack: () => void
  handleEscape: () => void
}

export interface ReaderChromeActionsResult extends ReaderChromeDisplayActions {
  clearHideTimer: () => void
}

// ── Hide Timer ─────────────────────────────────────────────────────────

function createReaderChromeHideTimerActions(
  state: ReaderChromeState
): ReaderChromeTimerActions {
  function clearHideTimer() {
    if (state.hideToolbarTimer.value) {
      clearTimeout(state.hideToolbarTimer.value)
      state.hideToolbarTimer.value = null
    }
  }

  function startHideTimer() {
    clearHideTimer()
    state.hideToolbarTimer.value = setTimeout(() => {
      if (!state.showSettings.value && !state.showCatalog.value) {
        state.showToolbar.value = false
      }
    }, 4000)
  }

  return { clearHideTimer, startHideTimer }
}

// ── Layer Actions ──────────────────────────────────────────────────────

function createReaderChromeLayerActions(
  state: ReaderChromeState
): ReaderChromeLayerActions {
  const closeToolbarLayer = () => {
    if (state.showToolbar.value) {
      state.showToolbar.value = false
      return true
    }
    return false
  }

  const closePanelLayer = () => {
    if (state.showKeyboardHelp.value) { state.showKeyboardHelp.value = false; return true }
    if (state.showBookInfo.value) { state.showBookInfo.value = false; return true }
    if (state.showSourcePicker.value) { state.showSourcePicker.value = false; return true }
    if (state.showSettings.value) { state.showSettings.value = false; return true }
    if (state.showCatalog.value) { state.showCatalog.value = false; return true }
    return false
  }

  const closeActiveLayer = () => closePanelLayer() || closeToolbarLayer()

  return { closeActiveLayer }
}

// ── Display Actions ────────────────────────────────────────────────────

function createReaderChromeToolbarDisplayActions(
  state: ReaderChromeState,
  timers: ReaderChromeTimerActions,
  options: ReaderChromeActionOptions
): Pick<ReaderChromeDisplayActions, 'toggleToolbar' | 'toggleZenMode'> {
  const toggleToolbar = () => {
    if (options.settingsStore.config.zenMode) return
    state.showToolbar.value = !state.showToolbar.value
    if (state.showToolbar.value) timers.startHideTimer()
  }

  const toggleZenMode = () => {
    const nextState = !options.settingsStore.config.zenMode
    options.settingsStore.updateConfig('zenMode', nextState)
    if (nextState) {
      state.showToolbar.value = false
      state.showSettings.value = false
      state.showCatalog.value = false
      options.toast({ title: '已进入禅模式', description: '所有界面已隐藏，双击中央区域退出', duration: 3000 })
    } else {
      options.toast({ title: '已退出禅模式', duration: 2000 })
    }
  }

  return { toggleToolbar, toggleZenMode }
}

function createReaderChromePanelDisplayActions(
  state: ReaderChromeState
): Pick<ReaderChromeDisplayActions,
  'toggleCatalog' | 'openCatalog' | 'toggleSettings' | 'openSettings' |
  'toggleKeyboardHelp' | 'openSourcePicker' | 'openBookInfo'
> {
  const toggleCatalog = () => { state.showCatalog.value = !state.showCatalog.value }
  const openCatalog = () => { state.showCatalog.value = true }
  const toggleSettings = () => { state.showSettings.value = !state.showSettings.value }
  const openSettings = () => { state.showSettings.value = true }
  const toggleKeyboardHelp = () => { state.showKeyboardHelp.value = !state.showKeyboardHelp.value }
  const openSourcePicker = () => { state.showSourcePicker.value = true }
  const openBookInfo = () => { state.showBookInfo.value = true }

  return { toggleCatalog, openCatalog, toggleSettings, openSettings, toggleKeyboardHelp, openSourcePicker, openBookInfo }
}

// ── Entry Point ────────────────────────────────────────────────────────

export function createReaderChromeActions(
  state: ReaderChromeState,
  options: ReaderChromeActionOptions
): ReaderChromeActionsResult {
  const timers = createReaderChromeHideTimerActions(state)
  const layers = createReaderChromeLayerActions(state)
  const toolbar = createReaderChromeToolbarDisplayActions(state, timers, options)
  const panel = createReaderChromePanelDisplayActions(state)

  const goBack = () => { void options.router.push('/') }
  const handleEscape = () => { if (!layers.closeActiveLayer()) goBack() }

  return {
    clearHideTimer: timers.clearHideTimer,
    ...toolbar,
    ...panel,
    goBack,
    handleEscape,
  }
}