/**
 * Sync Manager - 全局同步任务调度中心
 * 负责协调所有后台同步任务，支持优先级、去重和防抖。
 */

import { logger } from '../utils/logger'
import { nexusDB, StoreNames, type SyncTask } from '../utils/db'
import { networkDetector } from '../utils/networkOptimizer'

export type SyncPriority = 'CRITICAL' | 'NORMAL' | 'IDLE'

class SyncManager {
  private isProcessing = false
  private retryLimits: Record<SyncPriority, number> = {
    CRITICAL: 10,
    NORMAL: 5,
    IDLE: 3
  }

  /**
   * 添加同步任务
   */
  async addTask(task: Omit<SyncTask, 'id' | 'timestamp' | 'retryCount'>): Promise<string> {
    const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const syncTask: SyncTask = {
      ...task,
      id,
      timestamp: Date.now(),
      retryCount: 0
    }

    await nexusDB.put(StoreNames.SYNC_QUEUE, syncTask)
    logger.debug(`[Sync] Task added: ${task.type} (${task.priority})`)

    // 如果是 CRITICAL 任务，立即尝试触发处理
    if (task.priority === 'CRITICAL') {
      this.processQueue().catch(err => logger.error('[Sync] Queue processing error', err))
    }

    return id
  }

  /**
   * 启动定期同步（由全局服务调用）
   */
  startpolling(intervalMs = 30000) {
    setInterval(() => {
      if (networkDetector.isOnline()) {
        this.processQueue().catch(err => logger.error('[Sync] Polling error', err))
      }
    }, intervalMs)
  }

  /**
   * 处理任务队列
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || !networkDetector.isOnline()) return

    this.isProcessing = true
    try {
      const tasks = await nexusDB.getAll(StoreNames.SYNC_QUEUE)
      if (tasks.length === 0) return

      // 按优先级排序: CRITICAL > NORMAL > IDLE
      const sortedTasks = tasks.sort((a, b) => {
        const priorityScore = { CRITICAL: 0, NORMAL: 1, IDLE: 2 }
        return priorityScore[a.priority as SyncPriority] - priorityScore[b.priority as SyncPriority]
      })

      logger.info(`[Sync] Processing queue: ${sortedTasks.length} tasks...`)

      for (const task of sortedTasks) {
        if (!networkDetector.isOnline()) break

        try {
          await this.executeTask(task)
          await nexusDB.delete(StoreNames.SYNC_QUEUE, task.id)
          logger.debug(`[Sync] Task success: ${task.id}`)
        } catch (error) {
          task.retryCount++
          if (task.retryCount >= this.retryLimits[task.priority as SyncPriority]) {
            await nexusDB.delete(StoreNames.SYNC_QUEUE, task.id)
            logger.warn(`[Sync] Task discarded after max retries: ${task.id}`)
          } else {
            await nexusDB.put(StoreNames.SYNC_QUEUE, task)
            logger.error(`[Sync] Task failed (retry ${task.retryCount}): ${task.id}`, error as Error)
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

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }
}

export const syncManager = new SyncManager()
syncManager.startpolling() // 默认 30s 轮询
