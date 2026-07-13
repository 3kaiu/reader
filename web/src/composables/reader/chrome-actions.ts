import type { ReaderChromeActionOptions } from './chrome-option-types'
import type { ReaderChromeState } from './chrome-state'
import { createReaderChromeState } from './chrome-state'
import type {
  ReaderChromeController,
  ReaderChromeTimerActions,
  ReaderChromeLayerActions,
  ReaderChromeDisplayActions,
  ReaderChromeActionsResult,
  ReaderChromeBindingsResult,
  ReaderChromeBindingState,
} from './chrome-types'

// ── Scroll-driven toolbar visibility ───────────────────────────────────

let scrollLastY = 0
let chromeShowTime = 0

/** 初始化/更新滚动驱动工具栏 — 在 reader view 层调用 */
export function setupScrollDrivenChrome(
  showToolbar: ReaderChromeState['showToolbar'],
  _showSettings: ReaderChromeState['showSettings'],
  _showCatalog: ReaderChromeState['showCatalog']
) {
  let ticking = false

  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      const cy = window.scrollY
      const dy = cy - scrollLastY
      const inGrace = Date.now() - chromeShowTime < 600

      // 下滑超过 20px → 隐藏工具栏 (不在 grace period 内)
      if (dy > 20 && !inGrace) showToolbar.value = false
      // 上滑超过 12px → 显示工具栏
      else if (dy < -12) showToolbar.value = true
      // 在顶部 30px 内 → 始终显示
      if (cy < 30) showToolbar.value = true

      scrollLastY = cy
      ticking = false
    })
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  return () => window.removeEventListener('scroll', onScroll)
}

// ── Hide Timer ─────────────────────────────────────────────────────────

function createReaderChromeHideTimerActions(state: ReaderChromeState): ReaderChromeTimerActions {
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

function createReaderChromeLayerActions(state: ReaderChromeState): ReaderChromeLayerActions {
  const closeToolbarLayer = () => {
    if (state.showToolbar.value) {
      state.showToolbar.value = false
      return true
    }
    return false
  }

  const closePanelLayer = () => {
    if (state.showKeyboardHelp.value) {
      state.showKeyboardHelp.value = false
      return true
    }
    if (state.showBookInfo.value) {
      state.showBookInfo.value = false
      return true
    }
    if (state.showSourcePicker.value) {
      state.showSourcePicker.value = false
      return true
    }
    if (state.showSettings.value) {
      state.showSettings.value = false
      return true
    }
    if (state.showCatalog.value) {
      state.showCatalog.value = false
      return true
    }
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
    if (state.showToolbar.value) {
      chromeShowTime = Date.now()
      timers.startHideTimer()
    }
  }

  const toggleZenMode = () => {
    const nextState = !options.settingsStore.config.zenMode
    options.settingsStore.updateConfig('zenMode', nextState)
    if (nextState) {
      state.showToolbar.value = false
      state.showSettings.value = false
      state.showCatalog.value = false
      options.toast({
        title: '已进入禅模式',
        description: '所有界面已隐藏，双击中央区域退出',
        duration: 3000,
      })
    } else {
      options.toast({ title: '已退出禅模式', duration: 2000 })
    }
  }

  return { toggleToolbar, toggleZenMode }
}

function createReaderChromePanelDisplayActions(
  state: ReaderChromeState
): Pick<
  ReaderChromeDisplayActions,
  | 'toggleCatalog'
  | 'openCatalog'
  | 'toggleSettings'
  | 'openSettings'
  | 'toggleKeyboardHelp'
  | 'openSourcePicker'
  | 'openBookInfo'
> {
  const toggleCatalog = () => {
    state.showCatalog.value = !state.showCatalog.value
  }
  const openCatalog = () => {
    state.showCatalog.value = true
  }
  const toggleSettings = () => {
    state.showSettings.value = !state.showSettings.value
  }
  const openSettings = () => {
    state.showSettings.value = true
  }
  const toggleKeyboardHelp = () => {
    state.showKeyboardHelp.value = !state.showKeyboardHelp.value
  }
  const openSourcePicker = () => {
    state.showSourcePicker.value = true
  }
  const openBookInfo = () => {
    state.showBookInfo.value = true
  }

  return {
    toggleCatalog,
    openCatalog,
    toggleSettings,
    openSettings,
    toggleKeyboardHelp,
    openSourcePicker,
    openBookInfo,
  }
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

  const goBack = () => {
    void options.router.push('/')
  }
  const handleEscape = () => {
    if (!layers.closeActiveLayer()) goBack()
  }

  return {
    clearHideTimer: timers.clearHideTimer,
    ...toolbar,
    ...panel,
    goBack,
    handleEscape,
  }
}

// ── Controller ──────────────────────────────────────────────────────────

export function createReaderChromeController(
  options: ReaderChromeActionOptions
): ReaderChromeController {
  const state = createReaderChromeState()
  const actions = createReaderChromeActions(state, options)

  return { state, actions }
}

// ── Bindings ────────────────────────────────────────────────────────────

function createReaderChromeBindingState(state: ReaderChromeState): ReaderChromeBindingState {
  return {
    showToolbar: state.showToolbar,
    showCatalog: state.showCatalog,
    showSettings: state.showSettings,
    showSourcePicker: state.showSourcePicker,
    showBookInfo: state.showBookInfo,
    showKeyboardHelp: state.showKeyboardHelp,
  }
}

export function createReaderChromeBindings(
  state: ReaderChromeState,
  actions: ReaderChromeActionsResult
): ReaderChromeBindingsResult {
  const { clearHideTimer: _, ...displayActions } = actions

  return {
    ...createReaderChromeBindingState(state),
    ...displayActions,
  }
}

export function createReaderChromeControllerBindings(
  controller: ReaderChromeController
): ReaderChromeBindingsResult {
  return createReaderChromeBindings(controller.state, controller.actions)
}
