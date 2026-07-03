/**
 * Session types — merged from 3 individual files:
 *   session-init-context-types, session-lifecycle-context-types, session-option-types
 */
import type { ComputedRef } from 'vue'
import type { Router } from 'vue-router'
import type { useOfflineStore } from '@/stores/offlineStorage'
import type { useReaderStore } from '@/stores/reader'
import type { useSettingsStore } from '@/stores/settings'
import type { ReaderRouteTarget } from '@/utils/readerRoute'
import type { ReaderToast } from './shared-types'

export interface ReaderSessionOptions {
  toast: ReaderToast
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  offlineStore: ReturnType<typeof useOfflineStore>
}

export interface ReaderSessionInitContext {
  options: ReaderSessionOptions
  router: Router
  routeTarget: ComputedRef<ReaderRouteTarget | null>
}

export interface ReaderSessionLifecycleContext {
  options: ReaderSessionOptions
  routeSessionKey: ComputedRef<string>
  activeBookUrl: ComputedRef<string>
  selectionContainerRef: ComputedRef<Element | null>
  initReader: () => Promise<void>
}
