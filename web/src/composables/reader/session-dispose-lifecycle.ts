import { onUnmounted } from 'vue'
import { clearSpeculationRule } from '@/utils/speculation-rules'
import type { ReaderSessionLifecycleContext } from './session-types'

export function setupReaderSessionDisposeLifecycle(context: ReaderSessionLifecycleContext) {
  onUnmounted(() => {
    clearSpeculationRule()
    context.options.readerStore.disposeReader()
  })
}
