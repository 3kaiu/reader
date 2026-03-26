import {
  createReaderSessionMissingTargetHandler,
} from './session-init-missing-target'
import { createReaderSessionStartAction } from './session-init-start'
import type { ReaderSessionInitContext } from './session-init-context-types'

export function createReaderSessionInitializer(
  context: ReaderSessionInitContext,
) {
  const handleMissingTarget = createReaderSessionMissingTargetHandler(context)
  const startReaderSession = createReaderSessionStartAction(context)

  return async function initReader() {
    const target = context.routeTarget.value
    if (!target) {
      handleMissingTarget()
      return
    }

    await startReaderSession(target)
  }
}
