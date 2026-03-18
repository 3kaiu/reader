/**
 * Progress Sync Service
 * Syncs reading progress to Cloudflare KV via Worker
 * Strategy: Local-first with cloud backup
 */

import { logger } from '../utils/logger'
import { nexusDB, StoreNames, type ReadingProgress } from '../utils/db'
import { syncManager } from './syncManager'

// Configuration
const SYNC_WORKER_URL = import.meta.env.VITE_PROGRESS_SYNC_URL || ''
const DEBOUNCE_MS = 5000 // 5 seconds debounce for saves
const LOCAL_KEY_PREFIX = 'nexus_progress:' // Keep for migration

// Debounce timers
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Check if cloud sync is enabled
 */
export function isCloudSyncEnabled(): boolean {
  return !!SYNC_WORKER_URL
}

/**
 * Save progress locally (IndexedDB)
 */
async function saveLocal(progress: ReadingProgress): Promise<void> {
  try {
    await nexusDB.put(StoreNames.PROGRESS, progress)
  } catch (e) {
    logger.error('Failed to save progress to IndexedDB', e as Error)
  }
}

/**
 * Load progress from local storage
 */
async function loadLocal(bookId: string): Promise<ReadingProgress | null> {
  try {
    // 1. Try IndexedDB
    const progress = await nexusDB.get(StoreNames.PROGRESS, bookId)
    if (progress) return progress as any

    // 2. Migration: Try legacy localStorage
    const legacyData = localStorage.getItem(`${LOCAL_KEY_PREFIX}${bookId}`)
    if (legacyData) {
      try {
        const parsed = JSON.parse(legacyData)
        await saveLocal(parsed) // Migrate to IDB
        localStorage.removeItem(`${LOCAL_KEY_PREFIX}${bookId}`) // Cleanup
        return parsed
      } catch {
        return null
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Sync progress to cloud (via SyncManager)
 */
async function syncToCloud(progress: ReadingProgress): Promise<boolean> {
  if (!isCloudSyncEnabled()) return false

  try {
    await syncManager.addTask({
      type: 'progress-update',
      method: 'PUT',
      url: `${SYNC_WORKER_URL}/progress/${progress.bookId}`,
      data: {
        chapterIndex: progress.chapterIndex,
        scrollPercent: progress.scrollPercent,
      },
      priority: 'CRITICAL'
    })
    return true
  } catch (e) {
    logger.error('Failed to queue progress sync', e as Error)
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

// 跨标签页同步 (BroadcastChannel)
const BROADCAST_CHANNEL_NAME = 'nexus_progress_sync'
let broadcastChannel: BroadcastChannel | null = null

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
  broadcastChannel.onmessage = (event) => {
    const { type, progress } = event.data
    if (type === 'PROGRESS_UPDATE') {
      logger.debug(`[Sync] Received progress update from another tab for book: ${progress.bookId}`)
      // 发出自定义事件或由组件订阅（Pinia 会由 persistedstate 结合广播处理更佳，此处做底层保障）
      window.dispatchEvent(new CustomEvent('nexus:progress-sync', { detail: progress }))
    }
  }
}

/**
 * Save reading progress (debounced, local + cloud + broadcast)
 */
export async function saveProgress(
  bookId: string,
  chapterIndex: number,
  scrollPercent: number
): Promise<void> {
  const progress: ReadingProgress = {
    bookId,
    chapterIndex,
    scrollPercent,
    updatedAt: Date.now(),
  }

  // Always save locally immediately (now async)
  await saveLocal(progress)

  // 1. 跨标签页广播
  broadcastChannel?.postMessage({ type: 'PROGRESS_UPDATE', progress })

  // 2. 延迟云端同步
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
  const local = await loadLocal(bookId)
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
  await nexusDB.delete(StoreNames.PROGRESS, bookId)
  localStorage.removeItem(`${LOCAL_KEY_PREFIX}${bookId}`) // Cleanup legacy

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
export async function getAllLocalProgress(): Promise<ReadingProgress[]> {
  const results = await nexusDB.getAll(StoreNames.PROGRESS)

  // Combine with legacy if needed (optional, or just return IDB)
  return results as any
}
