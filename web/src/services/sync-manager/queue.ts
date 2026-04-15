import { nexusDB, StoreNames, type SyncTask } from '../../utils/db'
import { PRIORITY_SCORE, RETRY_LIMITS } from './config'

export async function saveSyncTask(task: SyncTask): Promise<void> {
  await nexusDB.put(StoreNames.SYNC_QUEUE, task)
}

export async function getAllSyncTasks(): Promise<SyncTask[]> {
  return await nexusDB.getAll<SyncTask>(StoreNames.SYNC_QUEUE)
}

export async function hasCriticalSyncTasks(): Promise<boolean> {
  const tasks = await getAllSyncTasks()
  return tasks.some(task => task.priority === 'CRITICAL')
}

export function sortSyncTasksByPriority(tasks: SyncTask[]): SyncTask[] {
  return [...tasks].sort((a, b) => PRIORITY_SCORE[a.priority] - PRIORITY_SCORE[b.priority])
}

export async function removeSyncTask(taskId: string): Promise<void> {
  await nexusDB.delete(StoreNames.SYNC_QUEUE, taskId)
}

export async function persistFailedSyncTask(task: SyncTask): Promise<void> {
  task.retryCount++

  if (task.retryCount >= RETRY_LIMITS[task.priority]) {
    await removeSyncTask(task.id)
    return
  }

  await saveSyncTask(task)
}
