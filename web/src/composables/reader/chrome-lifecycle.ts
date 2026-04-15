import { onUnmounted } from 'vue'
import type { ReaderChromeLifecycleActions } from './chrome-lifecycle-action-types'

export function setupReaderChromeLifecycle(actions: ReaderChromeLifecycleActions) {
  onUnmounted(() => {
    actions.clearHideTimer()
  })
}
