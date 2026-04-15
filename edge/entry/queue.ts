import type { QueueBatchLike, WorkerQueueMessage } from '../shared/types.ts'
import { QueueProcessor } from '../worker/systems.ts'
import type { EnhancedWorkerEnv } from '../worker/types.ts'

export async function processQueueBatch(
  batch: QueueBatchLike<WorkerQueueMessage>,
  env: EnhancedWorkerEnv
): Promise<void> {
  const queueProcessor = new QueueProcessor(env)

  for (const message of batch.messages) {
    await queueProcessor.processQueueMessage(message.body)
  }
}
