import { useRouter } from 'vue-router'
import {
  createReaderChromeControllerBindings,
} from '@/composables/reader/chrome-controller-bindings'
import { createReaderChromeController } from '@/composables/reader/chrome-controller'
import { setupReaderChromeLifecycle } from '@/composables/reader/chrome-lifecycle'
import type { ReaderChromeActionOptions } from '@/composables/reader/chrome-option-types'

type UseReaderChromeOptions = Omit<ReaderChromeActionOptions, 'router'>

export function useReaderChrome(options: UseReaderChromeOptions) {
  const router = useRouter()
  const controller = createReaderChromeController({
    router,
    ...options,
  })

  setupReaderChromeLifecycle(controller.actions)

  return createReaderChromeControllerBindings(controller)
}
