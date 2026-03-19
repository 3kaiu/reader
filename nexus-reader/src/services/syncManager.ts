/**
 * Sync Manager - 全局同步任务调度中心
 * 负责协调所有后台同步任务，支持优先级、去重和防抖。
 */

import { logger } from '../utils/logger'
import { nexusDB, StoreNames, type SyncTask } from '../utils/db'
import { networkDetector } from './network/optimizer'
import { hardwareScheduler, PowerMode } from './hardware/scheduler'

export type SyncPriority = 'CRITICAL' | 'NORMAL' | 'IDLE'

const PRIORITY_SCORE: Record<SyncPriority, number> = {
  CRITICAL: 0,
  NORMAL: 1,
  IDLE: 2,
}

const RETRY_LIMITS: Record<SyncPriority, number> = {
  CRITICAL: 5,
  NORMAL: 3,
  IDLE: 1,
}

class SyncManager {
  private isProcessing = false
  private pollingTimer: number | null = null

  /**
   * 添加同步任务
   */
  async addTask(task: Omit<SyncTask, 'id' | 'timestamp' | 'retryCount'>): Promise<string> {
    const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    // 如果是极低功耗模式且不是 CRITICAL 任务，降低优先级或延迟添加
    const quota = hardwareScheduler.getQuota()
    let priority = task.priority as SyncPriority
    if (quota.mode === PowerMode.ULTRA_LOW && priority !== 'CRITICAL') {
      priority = 'IDLE'
    }

    const syncTask: SyncTask = {
      ...task,
      priority,
      id,
      timestamp: Date.now(),
      retryCount: 0
    }

    await nexusDB.put(StoreNames.SYNC_QUEUE, syncTask)

    if (priority === 'CRITICAL') {
      this.processQueue().catch(err => logger.error('[Sync] Queue processing error', err))
    }

    return id
  }

  /**
   * 启动定期同步（环境感知版）
   */
  startPolling() {
    if (this.pollingTimer) clearInterval(this.pollingTimer)

    const quota = hardwareScheduler.getQuota()
    logger.info(`[Sync] Starting polling with interval: ${quota.syncIntervalMs}ms (${quota.mode})`)

    this.pollingTimer = setInterval(() => {
      if (networkDetector.isOnline()) {
        this.processQueue().catch(err => logger.error('[Sync] Polling error', err))
      }
    }, quota.syncIntervalMs)

    // 监听模式变化并重新调度
    // 此处简化处理，实际可根据 hardwareScheduler 的事件进行更新
  }

  /**
   * 处理任务队列 (分布式互斥 + 硬件感知版)
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || !networkDetector.isOnline()) return

    const quota = hardwareScheduler.getQuota()
    if (quota.mode === PowerMode.ULTRA_LOW && !(await this.hasCriticalTasks())) {
      logger.debug('[Sync] Skipping sync: Ultra low power mode and no critical tasks.')
      return
    }

    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      try {
        await navigator.locks.request('nexus_sync_queue_lock', { ifAvailable: true }, async (lock) => {
          if (!lock) return
          await this.internalProcessQueue(quota.maxConcurrentTasks)
        })
      } catch (err) {
        await this.internalProcessQueue(quota.maxConcurrentTasks)
      }
    } else {
      await this.internalProcessQueue(quota.maxConcurrentTasks)
    }
  }

  private async hasCriticalTasks(): Promise<boolean> {
    const tasks = await nexusDB.getAll<SyncTask>(StoreNames.SYNC_QUEUE)
    return tasks.some(task => task.priority === 'CRITICAL')
  }

  private async internalProcessQueue(limit: number): Promise<void> {
    this.isProcessing = true
    try {
      const tasks = await nexusDB.getAll<SyncTask>(StoreNames.SYNC_QUEUE)
      if (tasks.length === 0) return

      // 按优先级排序
      tasks.sort((a, b) => {
        return PRIORITY_SCORE[a.priority] - PRIORITY_SCORE[b.priority]
      })

      // 根据硬件配额限制任务数
      for (const task of tasks.slice(0, limit)) {
        try {
          await this.executeTask(task)
          await nexusDB.delete(StoreNames.SYNC_QUEUE, task.id)
        } catch (_err: unknown) {
          task.retryCount++
          if (task.retryCount >= RETRY_LIMITS[task.priority]) {
            await nexusDB.delete(StoreNames.SYNC_QUEUE, task.id)
          } else {
            await nexusDB.put(StoreNames.SYNC_QUEUE, task)
          }
        }
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async executeTask(task: SyncTask): Promise<void> {
    const response = await fetch(task.url, {
      method: task.method,
      headers: { 'Content-Type': 'application/json' },
      body: task.data ? JSON.stringify(task.data) : undefined
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  }
}

export const syncManager = new SyncManager()
syncManager.startPolling()
