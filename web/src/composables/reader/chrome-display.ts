import type { ReaderChromeActionContext } from './chrome-types'
import type { ReaderChromeDisplayActions } from './chrome-types'
import type { ReaderChromeLayerActions } from './chrome-types'
import type { ReaderChromeTimerActions } from './chrome-types'

// ── Toolbar Display (visibility toggle + zen mode) ─────────────────
export function createReaderChromeToolbarDisplayActions(
  context: ReaderChromeActionContext,
  timers: ReaderChromeTimerActions
): Pick<ReaderChromeDisplayActions, 'toggleToolbar' | 'toggleZenMode'> {
  const toggleToolbar = () => {
    if (context.options.settingsStore.config.zenMode) return
    context.state.showToolbar.value = !context.state.showToolbar.value
    if (context.state.showToolbar.value) timers.startHideTimer()
  }

  const toggleZenMode = () => {
    const nextState = !context.options.settingsStore.config.zenMode
    context.options.settingsStore.updateConfig('zenMode', nextState)
    if (nextState) {
      context.state.showToolbar.value = false
      context.state.showSettings.value = false
      context.state.showCatalog.value = false
      context.options.toast({ title: '已进入禅模式', description: '所有界面已隐藏，双击中央区域退出', duration: 3000 })
    } else {
      context.options.toast({ title: '已退出禅模式', duration: 2000 })
    }
  }

  return { toggleToolbar, toggleZenMode }
}

// ── Panel Display (open + toggle all panels) ───────────────────────
export function createReaderChromePanelDisplayActions(
  context: ReaderChromeActionContext
): Pick<ReaderChromeDisplayActions,
  'toggleCatalog' | 'openCatalog' | 'toggleSettings' | 'openSettings' |
  'toggleKeyboardHelp' | 'openSourcePicker' | 'openBookInfo'
> {
  const toggleCatalog = () => { context.state.showCatalog.value = !context.state.showCatalog.value }
  const openCatalog = () => { context.state.showCatalog.value = true }
  const toggleSettings = () => { context.state.showSettings.value = !context.state.showSettings.value }
  const openSettings = () => { context.state.showSettings.value = true }
  const toggleKeyboardHelp = () => { context.state.showKeyboardHelp.value = !context.state.showKeyboardHelp.value }
  const openSourcePicker = () => { context.state.showSourcePicker.value = true }
  const openBookInfo = () => { context.state.showBookInfo.value = true }

  return { toggleCatalog, openCatalog, toggleSettings, openSettings, toggleKeyboardHelp, openSourcePicker, openBookInfo }
}

// ── Layer Actions (close toolbar + panel) ──────────────────────────
export function createReaderChromeLayerActions(
  context: ReaderChromeActionContext
): ReaderChromeLayerActions {
  const closeToolbarLayer = () => {
    if (context.state.showToolbar.value) {
      context.state.showToolbar.value = false
      return true
    }
    return false
  }

  const closePanelLayer = () => {
    if (context.state.showKeyboardHelp.value) { context.state.showKeyboardHelp.value = false; return true }
    if (context.state.showBookInfo.value) { context.state.showBookInfo.value = false; return true }
    if (context.state.showSourcePicker.value) { context.state.showSourcePicker.value = false; return true }
    if (context.state.showSettings.value) { context.state.showSettings.value = false; return true }
    if (context.state.showCatalog.value) { context.state.showCatalog.value = false; return true }
    return false
  }

  const closeActiveLayer = () => closePanelLayer() || closeToolbarLayer()

  return { closeActiveLayer }
}

// ── Display aggregation (used by chrome-actions.ts) ────────────────
export function createReaderChromeDisplayActions(
  context: ReaderChromeActionContext,
  timers: ReaderChromeTimerActions,
  layers: ReaderChromeLayerActions
): ReaderChromeDisplayActions {
  const toolbar = createReaderChromeToolbarDisplayActions(context, timers)
  const panel = createReaderChromePanelDisplayActions(context)

  // system actions (goBack + handleEscape)
  const goBack = () => { void context.options.router.push('/') }
  const handleEscape = () => { if (!layers.closeActiveLayer()) goBack() }

  return {
    ...toolbar,
    ...panel,
    goBack,
    handleEscape,
  }
}
