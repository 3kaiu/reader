import { createReaderChromeBindings } from './chrome-bindings'
import type { ReaderChromeBindingsResult } from './chrome-binding-types'
import type { ReaderChromeController } from './chrome-controller-types'

export function createReaderChromeControllerBindings(
  controller: ReaderChromeController
): ReaderChromeBindingsResult {
  return createReaderChromeBindings(controller.state, controller.actions)
}
