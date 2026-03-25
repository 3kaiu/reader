/**
 * Self Healing System (自我修复系统)
 * 自动检测系统问题并执行修复操作
 */

import { getAutoTuner } from './auto-tuner.ts'
import {
  appendHealingHistory,
  buildHealthStatus,
  completeHealingEvent,
  createHealingEvent,
  failHealingEvent,
  logHealingEvent,
} from './self-healing/history.ts'
import {
  createDefaultHealingRules,
  isRuleTriggered,
  sortHealingRules,
} from './self-healing/rules.ts'
import { buildMetricsSnapshot as createMetricsSnapshot } from './self-healing/snapshot.ts'
import type {
  HealingEvent,
  HealingMetricsSnapshot,
  HealingRule,
  HealingStatus,
} from './self-healing/types.ts'

export type {
  HealingEvent,
  HealingRule,
  HealingStatus,
} from './self-healing/types.ts'

export class SelfHealingSystem {
  private rules: HealingRule[] = []
  private healingHistory: HealingEvent[] = []
  private lastHealingTime: Map<string, number> = new Map()
  private healingTimer: number | null = null
  private checkInterval = 60000
  private maxHistorySize = 1000

  constructor() {
    this.initializeRules()
  }

  private initializeRules(): void {
    this.rules = createDefaultHealingRules({
      clearExpiredCache: () => this.clearExpiredCache(),
      forceAutoTuning: async () => {
        const tuner = getAutoTuner()
        await tuner.forceTuning()
      },
      restartAIService: () => this.restartAIService(),
      cleanupDictionaryCache: () => this.cleanupDictionaryCache(),
      switchToBackupAIModel: () => this.switchToBackupAIModel(),
      retryKVOperations: () => this.retryKVOperations(),
    })
  }

  private addRule(rule: HealingRule): void {
    this.rules.push(rule)
  }

  private buildMetricsSnapshot(): HealingMetricsSnapshot {
    return createMetricsSnapshot()
  }

  // 开始自我修复监控
  start(): void {
    if (this.healingTimer) return

    this.healingTimer = setInterval(() => {
      this.performHealthCheck()
    }, this.checkInterval)

    console.log('Self-healing system started')
  }

  // 停止自我修复
  stop(): void {
    if (this.healingTimer) {
      clearInterval(this.healingTimer)
      this.healingTimer = null
      console.log('Self-healing system stopped')
    }
  }

  // 执行健康检查
  private async performHealthCheck(): Promise<void> {
    try {
      const metrics = this.buildMetricsSnapshot()
      const now = Date.now()
      const triggeredRules = sortHealingRules(
        this.rules.filter(rule =>
          isRuleTriggered(rule, metrics, this.lastHealingTime.get(rule.id) || 0, now)
        )
      )

      // 执行修复操作
      for (const rule of triggeredRules) {
        await this.executeHealingRule(rule)
      }
    } catch (error) {
      console.error('Health check failed:', error)
    }
  }

  private async executeHealingRule(rule: HealingRule): Promise<void> {
    const startTime = Date.now()
    let event = createHealingEvent(rule, startTime)

    try {
      // 执行修复
      await rule.action()

      // 记录成功
      event = completeHealingEvent(event, Date.now() - startTime)

      // 更新冷却时间
      this.lastHealingTime.set(rule.id, Date.now())
    } catch (error) {
      // 记录失败
      event = failHealingEvent(event, Date.now() - startTime, error)

      console.error(`Healing rule ${rule.id} failed:`, error)
    }

    // 添加到历史记录
    this.addToHistory(event)
  }

  private addToHistory(event: HealingEvent): void {
    this.healingHistory = appendHealingHistory(this.healingHistory, event, this.maxHistorySize)
    logHealingEvent(event)
  }

  // 修复操作实现
  private async clearExpiredCache(): Promise<void> {
    // 实现缓存清理逻辑
    // 这里应该调用缓存服务的清理方法
    console.log('Clearing expired cache entries...')
  }

  private async restartAIService(): Promise<void> {
    // 重启AI服务的逻辑
    console.log('Restarting AI service limits...')
  }

  private async cleanupDictionaryCache(): Promise<void> {
    // 清理词典缓存
    console.log('Cleaning up dictionary cache...')
  }

  private async switchToBackupAIModel(): Promise<void> {
    // 切换到备用AI模型
    console.log('Switching to backup AI model...')
  }

  private async retryKVOperations(): Promise<void> {
    // 重试KV操作
    console.log('Retrying KV operations...')
  }

  // 获取修复历史
  getHealingHistory(limit = 50): HealingEvent[] {
    return this.healingHistory.slice(-limit)
  }

  // 获取系统健康状态
  getHealthStatus(): HealingStatus {
    return buildHealthStatus(
      this.healingHistory,
      this.healingTimer !== null,
      this.rules.length
    )
  }

  // 手动触发修复
  async triggerHealing(ruleId?: string): Promise<void> {
    if (ruleId) {
      const rule = this.rules.find(r => r.id === ruleId)
      if (rule) {
        await this.executeHealingRule(rule)
      } else {
        throw new Error(`Rule ${ruleId} not found`)
      }
    } else {
      // 触发所有规则检查
      await this.performHealthCheck()
    }
  }

  // 添加自定义修复规则
  addCustomRule(rule: HealingRule): void {
    // 验证规则
    if (!rule.id || !rule.name || !rule.condition || !rule.action) {
      throw new Error('Invalid healing rule')
    }

    // 检查是否已存在
    if (this.rules.some(r => r.id === rule.id)) {
      throw new Error(`Rule ${rule.id} already exists`)
    }

    this.addRule(rule)
    console.log(`Custom healing rule added: ${rule.name}`)
  }

  // 移除修复规则
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId)
    if (index >= 0) {
      this.rules.splice(index, 1)
      console.log(`Healing rule removed: ${ruleId}`)
      return true
    }
    return false
  }
}

// 全局自我修复实例
let globalSelfHealing: SelfHealingSystem | null = null

export function getSelfHealingSystem(): SelfHealingSystem {
  if (!globalSelfHealing) {
    globalSelfHealing = new SelfHealingSystem()
  }
  return globalSelfHealing
}

// 自动启动自我修复
export function startSelfHealing(): void {
  const system = getSelfHealingSystem()
  system.start()
}

// 停止自我修复
export function stopSelfHealing(): void {
  if (globalSelfHealing) {
    globalSelfHealing.stop()
  }
}
