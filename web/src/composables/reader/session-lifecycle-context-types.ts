import type { ComputedRef } from 'vue'
import type { ReaderSessionOptions } from './session-option-types'

export interface ReaderSessionLifecycleContext {
  options: ReaderSessionOptions
  routeSessionKey: ComputedRef<string>
  activeBookUrl: ComputedRef<string>
  selectionContainerRef: ComputedRef<Element | null>
  initReader: () => Promise<void>
}
