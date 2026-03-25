import { useRouter } from 'vue-router'
import { createReaderChromeBindings } from '@/composables/reader/chrome-bindings'
import { createReaderChromeController } from '@/composables/reader/chrome-controller'
import { setupReaderChromeLifecycle } from '@/composables/reader/chrome-lifecycle'
import type { ReaderChromeActionOptions } from '@/composables/reader/chrome-action-types'

type UseReaderChromeOptions = Omit<ReaderChromeActionOptions, 'router'>

export function useReaderChrome(options: UseReaderChromeOptions) {
  const router = useRouter()
  const controller = createReaderChromeController({
    router,
    ...options,
  })

  setupReaderChromeLifecycle(controller.actions.clearHideTimer)

  return createReaderChromeBindings(controller.state, controller.actions)
}
