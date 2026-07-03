/**
 * Chrome types — merged from individual type-only files.
 *
 * Previously split across 7 files:
 *   chrome-actions-result-types, chrome-context-types, chrome-controller-types,
 *   chrome-display-action-types, chrome-layer-action-types,
 *   chrome-lifecycle-action-types, chrome-timer-action-types
 */
import type { ReaderChromeActionOptions } from './chrome-option-types'
import type { ReaderChromeState } from './chrome-state'

// ── Display Actions ─────────────────────────────────────────────────
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

// ── Timer Actions ──────────────────────────────────────────────────
export interface ReaderChromeTimerActions {
  clearHideTimer: () => void
  startHideTimer: () => void
}

// ── Layer Actions ──────────────────────────────────────────────────
export interface ReaderChromeLayerActions {
  closeActiveLayer: () => boolean
}

// ── Composite Result ───────────────────────────────────────────────
export interface ReaderChromeActionsResult extends ReaderChromeDisplayActions {
  clearHideTimer: () => void
}

// ── Context ────────────────────────────────────────────────────────
export interface ReaderChromeActionContext {
  state: ReaderChromeState
  options: ReaderChromeActionOptions
}

// ── Controller ─────────────────────────────────────────────────────
export interface ReaderChromeController {
  state: ReaderChromeState
  actions: ReaderChromeActionsResult
}

// ── Lifecycle ──────────────────────────────────────────────────────
export type ReaderChromeLifecycleActions = Pick<ReaderChromeActionsResult, 'clearHideTimer'>
