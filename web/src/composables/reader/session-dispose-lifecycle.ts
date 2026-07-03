import { onUnmounted } from 'vue'
import type { ReaderSessionLifecycleContext } from './session-types'

export function setupReaderSessionDisposeLifecycle(context: ReaderSessionLifecycleContext) {
  onUnmounted(() => {
    context.options.readerStore.disposeReader()
  })
}
