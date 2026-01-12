/**
 * Progress Sync Service
 * Syncs reading progress to Cloudflare KV via Worker
 * Strategy: Local-first with cloud backup
 */

import { logger } from '../utils/logger'

// Configuration
const SYNC_WORKER_URL = import.meta.env.VITE_PROGRESS_SYNC_URL || ''
const DEBOUNCE_MS = 5000 // 5 seconds debounce for saves
const LOCAL_KEY_PREFIX = 'nexus_progress:'

interface ReadingProgress {
  bookId: string
  chapterIndex: number
  scrollPercent: number
  updatedAt: number
}

// Debounce timers
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Check if cloud sync is enabled
 */
export function isCloudSyncEnabled(): boolean {
  return !!SYNC_WORKER_URL
}

/**
 * Save progress locally (always)
 */
function saveLocal(progress: ReadingProgress): void {
  try {
    localStorage.setItem(
      `${LOCAL_KEY_PREFIX}${progress.bookId}`,
      JSON.stringify(progress)
    )
  } catch (e) {
    logger.error('Failed to save progress locally', e as Error)
  }
}

/**
 * Load progress from local storage
 */
function loadLocal(bookId: string): ReadingProgress | null {
  try {
    const data = localStorage.getItem(`${LOCAL_KEY_PREFIX}${bookId}`)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

/**
 * Sync progress to cloud (if enabled)
 */
async function syncToCloud(progress: ReadingProgress): Promise<boolean> {
  if (!isCloudSyncEnabled()) return false

  try {
    const response = await fetch(`${SYNC_WORKER_URL}/progress/${progress.bookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterIndex: progress.chapterIndex,
        scrollPercent: progress.scrollPercent,
      }),
    })
    return response.ok
  } catch (e) {
    logger.error('Failed to sync progress to cloud', e as Error)
    return false
  }
}

/**
 * Load progress from cloud
 */
async function loadFromCloud(bookId: string): Promise<ReadingProgress | null> {
  if (!isCloudSyncEnabled()) return null

  try {
    const response = await fetch(`${SYNC_WORKER_URL}/progress/${bookId}`)
    if (response.ok) {
      return await response.json()
    }
    return null
  } catch (e) {
    logger.error('Failed to load progress from cloud', e as Error)
    return null
  }
}

/**
 * Save reading progress (debounced, local + cloud)
 */
export function saveProgress(
  bookId: string,
  chapterIndex: number,
  scrollPercent: number
): void {
  const progress: ReadingProgress = {
    bookId,
    chapterIndex,
    scrollPercent,
    updatedAt: Date.now(),
  }

  // Always save locally immediately
  saveLocal(progress)

  // Debounce cloud sync
  const existingTimer = saveTimers.get(bookId)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const timer = setTimeout(() => {
    syncToCloud(progress)
    saveTimers.delete(bookId)
  }, DEBOUNCE_MS)

  saveTimers.set(bookId, timer)
}

/**
 * Load reading progress (local-first, cloud fallback with merge)
 */
export async function loadProgress(bookId: string): Promise<ReadingProgress | null> {
  const local = loadLocal(bookId)
  const cloud = await loadFromCloud(bookId)

  // If both exist, use the more recent one
  if (local && cloud) {
    if (cloud.updatedAt > local.updatedAt) {
      // Cloud is newer, update local
      saveLocal(cloud)
      return cloud
    }
    // Local is newer, sync to cloud
    syncToCloud(local)
    return local
  }

  // Only one exists
  if (cloud) {
    saveLocal(cloud)
    return cloud
  }

  return local
}

/**
 * Delete progress
 */
export async function deleteProgress(bookId: string): Promise<void> {
  // Remove local
  localStorage.removeItem(`${LOCAL_KEY_PREFIX}${bookId}`)

  // Remove from cloud
  if (isCloudSyncEnabled()) {
    try {
      await fetch(`${SYNC_WORKER_URL}/progress/${bookId}`, { method: 'DELETE' })
    } catch {
      // Ignore cloud delete errors
    }
  }
}

/**
 * Get all local progress (for debugging/display)
 */
export function getAllLocalProgress(): ReadingProgress[] {
  const results: ReadingProgress[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(LOCAL_KEY_PREFIX)) {
      const data = localStorage.getItem(key)
      if (data) {
        try {
          results.push(JSON.parse(data))
        } catch {
          // Ignore invalid data
        }
      }
    }
  }
  return results
}
