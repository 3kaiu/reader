import type { SyncTask } from '../../utils/db'

export async function executeSyncTask(task: SyncTask): Promise<void> {
  const response = await fetch(task.url, {
    method: task.method,
    headers: { 'Content-Type': 'application/json' },
    body: task.data ? JSON.stringify(task.data) : undefined,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
}
