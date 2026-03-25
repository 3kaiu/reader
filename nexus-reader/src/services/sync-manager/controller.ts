import { logger } from '../../utils/logger'
import { type SyncTask } from '../../utils/db'
import type { SyncPriority } from './types'
import {
  createSyncTaskId,
  resolveSyncTaskPriority,
} from './config'
import { executeSyncTask } from './execution'
import { withSyncQueueLock } from './locks'
import {
  canProcessSyncQueue,
  getSyncQuota,
  shouldSkipSyncProcessing,
  startSyncPolling,
  stopSyncPolling,
} from './polling'
import {
  getAllSyncTasks,
  hasCriticalSyncTasks,
  persistFailedSyncTask,
  removeSyncTask,
  saveSyncTask,
  sortSyncTasksByPriority,
} from './queue'

export class SyncManager {
  private isProcessing = false
  private pollingTimer: ReturnType<typeof setInterval> | null = null

  async addTask(task: Omit<SyncTask, 'id' | 'timestamp' | 'retryCount'>): Promise<string> {
    const quota = getSyncQuota()
    const priority = resolveSyncTaskPriority(task.priority as SyncPriority, quota.mode)
    const syncTask: SyncTask = {
      ...task,
      priority,
      id: createSyncTaskId(),
      timestamp: Date.now(),
      retryCount: 0,
    }

    await saveSyncTask(syncTask)

    if (priority === 'CRITICAL') {
      void this.processQueue().catch(error => logger.error('[Sync] Queue processing error', { error }))
    }

    return syncTask.id
  }

  startPolling(): void {
    this.pollingTimer = startSyncPolling(this.pollingTimer, () => this.processQueue())
  }

  stopPolling(): void {
    this.pollingTimer = stopSyncPolling(this.pollingTimer)
  }

  async processQueue(): Promise<void> {
    if (!canProcessSyncQueue(this.isProcessing)) {
      return
    }

    if (shouldSkipSyncProcessing(await hasCriticalSyncTasks())) {
      return
    }

    await withSyncQueueLock(async () => {
      await this.processTaskBatch(getSyncQuota().maxConcurrentTasks)
    })
  }

  private async processTaskBatch(limit: number): Promise<void> {
    this.isProcessing = true

    try {
      const tasks = sortSyncTasksByPriority(await getAllSyncTasks())
      if (tasks.length === 0) {
        return
      }

      for (const task of tasks.slice(0, limit)) {
        try {
          await executeSyncTask(task)
          await removeSyncTask(task.id)
        } catch {
          await persistFailedSyncTask(task)
        }
      }
    } finally {
      this.isProcessing = false
    }
  }
}
