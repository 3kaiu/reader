/**
 * Worker Bus - 跨服务资源协调器
 * 管理系统中所有活动的 Worker，协调高负载任务期间的资源分配。
 */

import { ref, computed } from 'vue'
import { logger } from './logger'

export type WorkerType = 'AI' | 'TTS' | 'RENDER' | 'PARSER'

interface RegisteredWorker {
  id: string
  type: WorkerType
  status: 'IDLE' | 'BUSY'
  lastActive: number
}

class WorkerBus {
  private workers = ref<Map<string, RegisteredWorker>>(new Map())
  private heavyDutyInProgress = computed(() => {
    return Array.from(this.workers.value.values()).some(
      w => (w.type === 'AI' || w.type === 'TTS') && w.status === 'BUSY'
    )
  })

  /**
   * 注册 Worker
   */
  register(id: string, type: WorkerType) {
    this.workers.value.set(id, {
      id,
      type,
      status: 'IDLE',
      lastActive: Date.now()
    })
    logger.debug(`[WorkerBus] Registered ${type} worker: ${id}`)
  }

  /**
   * 更新 Worker 状态
   */
  updateStatus(id: string, status: 'IDLE' | 'BUSY') {
    const worker = this.workers.value.get(id)
    if (worker) {
      worker.status = status
      worker.lastActive = Date.now()

      if (status === 'BUSY' && (worker.type === 'AI' || worker.type === 'TTS')) {
        logger.info(`[WorkerBus] Heavy duty task started by ${worker.type}. Suppressing background tasks.`)
      }
    }
  }

  /**
   * 检查是否允许执行背景任务
   */
  shouldAllowBackgroundTask(): boolean {
    return !this.heavyDutyInProgress.value
  }

  /**
   * 卸载 Worker
   */
  unregister(id: string) {
    this.workers.value.delete(id)
    logger.debug(`[WorkerBus] Unregistered worker: ${id}`)
  }

  /**
   * 获取当前统计
   */
  getStats() {
    return {
      total: this.workers.value.size,
      busyCount: Array.from(this.workers.value.values()).filter(w => w.status === 'BUSY').length,
      isHeavyDuty: this.heavyDutyInProgress.value
    }
  }
}

export const workerBus = new WorkerBus()
