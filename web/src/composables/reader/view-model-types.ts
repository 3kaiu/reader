/**
 * View-model types — merged from 6 individual files:
 *   view-feature-types, view-model-experience-feature-types,
 *   view-model-page-feature-types, view-model-result-types,
 *   session-route-state-types, page-action-types
 */
import type { ComputedRef, Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { useReaderActions } from '@/composables/useReaderActions'
import type { useReaderChrome } from '@/composables/useReaderChrome'
import type { useReaderSession } from '@/composables/useReaderSession'
import type { ReaderRouteTarget } from '@/utils/readerRoute'
import type { ReaderContentInstance } from './shared-types'
import type { ReaderExperienceActions } from './experience-types'
import { createReaderExperienceState } from './experience-state'
import { createReaderPageState } from './page-state'

// ── Feature types ──────────────────────────────────────────────────
export type ReaderViewActionFeature = ReturnType<typeof useReaderActions>
export type ReaderViewChromeFeature = ReturnType<typeof useReaderChrome>
export type ReaderViewSessionFeature = ReturnType<typeof useReaderSession>

export interface ReaderViewFeatures {
  session: ReaderViewSessionFeature
  chrome: ReaderViewChromeFeature
  actions: ReaderViewActionFeature
}

export interface ReaderExperienceModelFeatures {
  session: ReaderViewFeatures['session']
  chrome: ReaderViewFeatures['chrome']
  actions: ReaderViewFeatures['actions']
}

export interface ReaderPageModelFeatures {
  chrome: ReaderViewFeatures['chrome']
  actions: ReaderViewFeatures['actions']
}

// ── View model result ──────────────────────────────────────────────
export interface ReaderViewModelResult {
  readerPageState: ReturnType<typeof createReaderPageState>
  readerPageActions: ReaderPageActions
  readerExperienceState: ReturnType<typeof createReaderExperienceState>
  readerExperienceActions: ReaderExperienceActions
}

// ── Page actions ───────────────────────────────────────────────────
export interface ReaderPageActions {
  toggleToolbar(): void
  handlePrevChapter(): void | Promise<void>
  handleNextChapter(): void | Promise<void>
  retryCurrentChapter(): void | Promise<void>
  toggleFullscreen(): void
  toggleCatalog(): void
  toggleSettings(): void
  toggleDayNight(): void
  toggleZenMode(): void
  toggleKeyboardHelp(): void
  handleEscape(): void
  openSourcePicker(): void
}

// ── Session route state ────────────────────────────────────────────
export interface ReaderSessionRouteState {
  route: RouteLocationNormalizedLoaded
  contentRef: Ref<ReaderContentInstance>
  routeTarget: ComputedRef<ReaderRouteTarget | null>
  routeBookUrl: ComputedRef<string | null>
  routeSourceId: ComputedRef<string | null>
  routeSessionKey: ComputedRef<string>
  activeBookUrl: ComputedRef<string>
  selectionContainerRef: ComputedRef<Element | null>
}
