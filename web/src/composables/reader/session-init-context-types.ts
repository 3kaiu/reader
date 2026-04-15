import type { ComputedRef } from 'vue'
import type { Router } from 'vue-router'
import type { ReaderRouteTarget } from '@/utils/readerRoute'
import type { ReaderSessionOptions } from './session-option-types'

export interface ReaderSessionInitContext {
  options: ReaderSessionOptions
  router: Router
  routeTarget: ComputedRef<ReaderRouteTarget | null>
}
