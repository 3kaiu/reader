import type { ComputedRef, Ref } from 'vue'
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
import type { useDecoderStore } from '@/stores/decoder'
import type { useOfflineStore } from '@/stores/offlineStorage'
import type { useReaderStore } from '@/stores/reader'
import type { useSettingsStore } from '@/stores/settings'
import type { ReaderRouteTarget } from '@/utils/readerRoute'
import type {
  ReaderContentInstance,
  ReaderToast,
} from './types'

export interface ReaderSessionOptions {
  toast: ReaderToast
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
  offlineStore: ReturnType<typeof useOfflineStore>
  decoderStore: ReturnType<typeof useDecoderStore>
  decoderAddonEnabled: boolean
}

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
