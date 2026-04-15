import type { ComputedRef, Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { ReaderRouteTarget } from '@/utils/readerRoute'
import type { ReaderContentInstance } from './shared-types'

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
