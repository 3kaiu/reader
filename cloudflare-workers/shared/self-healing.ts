/**
 * Self Healing System (自我修复系统)
 * 自动检测系统问题并执行修复操作
 */

import { getPerformanceMonitor } from './performance-monitor.ts';
import { getAutoTuner } from './auto-tuner.ts';

export interface HealingRule {
  id: string;
  name: string;
  description: string;
  condition: (metrics: any) => boolean;
  action: () => Promise<void> | void;
  cooldown: number; // 修复冷却时间 (毫秒)
  priority: 'critical' | 'high' | 'medium' | 'low';
  maxRetries: number;
}

export interface HealingEvent {
  id: string;
  timestamp: number;
  ruleId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
  action: string;
  success: boolean;
  duration: number;
  error?: string;
}

export class SelfHealingSystem {
  private rules: HealingRule[] = [];
  private healingHistory: HealingEvent[] = [];
  private lastHealingTime: Map<string, number> = new Map();
  private healingTimer: number | null = null;
  private checkInterval = 60000; // 1分钟检查一次
  private maxHistorySize = 1000;

  constructor() {
    this.initializeRules();
  }

  private initializeRules(): void {
    // 缓存命中率过低
    this.addRule({
      id: 'cache-hit-rate-low',
      name: '缓存命中率过低',
      description: '缓存命中率低于阈值，可能影响性能',
      condition: (metrics) => {
        const cacheMetrics = metrics.cache || {};
        return cacheMetrics.hitRate && cacheMetrics.hitRate < 0.5;
      },
      action: async () => {
        console.log('执行: 清理过期缓存');
        // 这里可以实现缓存清理逻辑
        await this.clearExpiredCache();
      },
      cooldown: 300000, // 5分钟冷却
      priority: 'medium',
      maxRetries: 3
    });

    // 响应时间过长
    this.addRule({
      id: 'high-response-time',
      name: '响应时间过长',
      description: '平均响应时间超过1秒',
      condition: (metrics) => {
        const decodeMetrics = metrics.performance?.decode_process;
        return decodeMetrics && decodeMetrics.avgDuration > 1000;
      },
      action: async () => {
        console.log('执行: 增加缓存TTL');
        const tuner = getAutoTuner();
        await tuner.forceTuning();
      },
      cooldown: 180000, // 3分钟冷却
      priority: 'high',
      maxRetries: 5
    });

    // 错误率过高
    this.addRule({
      id: 'high-error-rate',
      name: '错误率过高',
      description: '错误率超过5%',
      condition: (metrics) => {
        const operations = Object.values(metrics.performance || {}) as Array<{ errorRate?: number }>;
        if (operations.length === 0) {
          return false;
        }
        const avgErrorRate = operations.reduce((sum: number, op) =>
          sum + (op.errorRate || 0), 0) / operations.length;
        return avgErrorRate > 0.05;
      },
      action: async () => {
        console.log('执行: 重启AI服务限制');
        // 这里可以实现AI服务重启或限制逻辑
        await this.restartAIService();
      },
      cooldown: 600000, // 10分钟冷却
      priority: 'critical',
      maxRetries: 2
    });

    // 内存使用过高
    this.addRule({
      id: 'high-memory-usage',
      name: '内存使用过高',
      description: '内存使用率超过80%',
      condition: (metrics) => {
        return metrics.memory && metrics.memory.usage > 0.8;
      },
      action: async () => {
        console.log('执行: 清理词典缓存');
        await this.cleanupDictionaryCache();
      },
      cooldown: 120000, // 2分钟冷却
      priority: 'high',
      maxRetries: 3
    });

    // AI服务不可用
    this.addRule({
      id: 'ai-service-unavailable',
      name: 'AI服务不可用',
      description: 'AI服务连续失败',
      condition: (metrics) => {
        const aiMetrics = metrics.ai || {};
        return aiMetrics.consecutiveFailures && aiMetrics.consecutiveFailures > 5;
      },
      action: async () => {
        console.log('执行: 切换到备用AI模型');
        await this.switchToBackupAIModel();
      },
      cooldown: 30000, // 30秒冷却
      priority: 'critical',
      maxRetries: 1
    });

    // KV存储错误
    this.addRule({
      id: 'kv-storage-errors',
      name: 'KV存储错误',
      description: 'KV存储操作连续失败',
      condition: (metrics) => {
        return metrics.kv && metrics.kv.errorRate > 0.1;
      },
      action: async () => {
        console.log('执行: 重试KV操作并切换到内存模式');
        await this.retryKVOperations();
      },
      cooldown: 60000, // 1分钟冷却
      priority: 'critical',
      maxRetries: 2
    });
  }

  private addRule(rule: HealingRule): void {
    this.rules.push(rule);
  }

  // 开始自我修复监控
  start(): void {
    if (this.healingTimer) return;

    this.healingTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.checkInterval);

    console.log('Self-healing system started');
  }

  // 停止自我修复
  stop(): void {
    if (this.healingTimer) {
      clearInterval(this.healingTimer);
      this.healingTimer = null;
      console.log('Self-healing system stopped');
    }
  }

  // 执行健康检查
  private async performHealthCheck(): Promise<void> {
    try {
      const monitor = getPerformanceMonitor();
      const metrics = monitor.exportMetrics();

      // 检查所有规则
      const triggeredRules = this.rules.filter(rule => {
        // 检查冷却时间
        const lastHealing = this.lastHealingTime.get(rule.id) || 0;
        if (Date.now() - lastHealing < rule.cooldown) {
          return false;
        }

        // 检查条件
        try {
          return rule.condition(metrics);
        } catch (error) {
          console.error(`Rule ${rule.id} condition check failed:`, error);
          return false;
        }
      });

      // 按优先级排序
      triggeredRules.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

      // 执行修复操作
      for (const rule of triggeredRules) {
        await this.executeHealingRule(rule);
      }

    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  private async executeHealingRule(rule: HealingRule): Promise<void> {
    const eventId = crypto.randomUUID();
    const startTime = Date.now();
    let event: HealingEvent = {
      id: eventId,
      timestamp: startTime,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.priority === 'critical' ? 'critical' :
        rule.priority === 'high' ? 'error' : 'warning',
      description: rule.description,
      action: `Executing: ${rule.name}`,
      success: false,
      duration: 0
    };

    try {
      // 执行修复
      await rule.action();

      // 记录成功
      event.success = true;
      event.duration = Date.now() - startTime;
      event.action = `Completed: ${rule.name}`;

      // 更新冷却时间
      this.lastHealingTime.set(rule.id, Date.now());

    } catch (error) {
      // 记录失败
      event = {
        ...event,
        severity: 'error',
        action: `Failed: ${rule.name}`,
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      console.error(`Healing rule ${rule.id} failed:`, error);
    }

    // 添加到历史记录
    this.addToHistory(event);
  }

  private addToHistory(event: HealingEvent): void {
    this.healingHistory.push(event);

    // 限制历史记录大小
    if (this.healingHistory.length > this.maxHistorySize) {
      this.healingHistory = this.healingHistory.slice(-this.maxHistorySize);
    }

    // 记录到控制台
    const level = event.severity === 'critical' ? '🚨' :
      event.severity === 'error' ? '❌' :
        event.severity === 'warning' ? '⚠️' : 'ℹ️';

    console.log(`${level} [SELF-HEALING] ${event.ruleName}: ${event.description}`);
    if (event.error) {
      console.log(`   Error: ${event.error}`);
    }
  }

  // 修复操作实现
  private async clearExpiredCache(): Promise<void> {
    // 实现缓存清理逻辑
    // 这里应该调用缓存服务的清理方法
    console.log('Clearing expired cache entries...');
  }

  private async restartAIService(): Promise<void> {
    // 重启AI服务的逻辑
    console.log('Restarting AI service limits...');
  }

  private async cleanupDictionaryCache(): Promise<void> {
    // 清理词典缓存
    console.log('Cleaning up dictionary cache...');
  }

  private async switchToBackupAIModel(): Promise<void> {
    // 切换到备用AI模型
    console.log('Switching to backup AI model...');
  }

  private async retryKVOperations(): Promise<void> {
    // 重试KV操作
    console.log('Retrying KV operations...');
  }

  // 获取修复历史
  getHealingHistory(limit = 50): HealingEvent[] {
    return this.healingHistory.slice(-limit);
  }

  // 获取系统健康状态
  getHealthStatus(): {
    isActive: boolean;
    rulesCount: number;
    recentEvents: HealingEvent[];
    healingStats: {
      totalHealings: number;
      successfulHealings: number;
      failedHealings: number;
      avgHealingTime: number;
    };
  } {
    const recentEvents = this.healingHistory.slice(-10);
    const successful = this.healingHistory.filter(e => e.success);
    const failed = this.healingHistory.filter(e => !e.success);

    return {
      isActive: this.healingTimer !== null,
      rulesCount: this.rules.length,
      recentEvents,
      healingStats: {
        totalHealings: this.healingHistory.length,
        successfulHealings: successful.length,
        failedHealings: failed.length,
        avgHealingTime: successful.length > 0
          ? successful.reduce((sum, e) => sum + e.duration, 0) / successful.length
          : 0
      }
    };
  }

  // 手动触发修复
  async triggerHealing(ruleId?: string): Promise<void> {
    if (ruleId) {
      const rule = this.rules.find(r => r.id === ruleId);
      if (rule) {
        await this.executeHealingRule(rule);
      } else {
        throw new Error(`Rule ${ruleId} not found`);
      }
    } else {
      // 触发所有规则检查
      await this.performHealthCheck();
    }
  }

  // 添加自定义修复规则
  addCustomRule(rule: HealingRule): void {
    // 验证规则
    if (!rule.id || !rule.name || !rule.condition || !rule.action) {
      throw new Error('Invalid healing rule');
    }

    // 检查是否已存在
    if (this.rules.some(r => r.id === rule.id)) {
      throw new Error(`Rule ${rule.id} already exists`);
    }

    this.addRule(rule);
    console.log(`Custom healing rule added: ${rule.name}`);
  }

  // 移除修复规则
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      console.log(`Healing rule removed: ${ruleId}`);
      return true;
    }
    return false;
  }
}

// 全局自我修复实例
let globalSelfHealing: SelfHealingSystem | null = null;

export function getSelfHealingSystem(): SelfHealingSystem {
  if (!globalSelfHealing) {
    globalSelfHealing = new SelfHealingSystem();
  }
  return globalSelfHealing;
}

// 自动启动自我修复
export function startSelfHealing(): void {
  const system = getSelfHealingSystem();
  system.start();
}

// 停止自我修复
export function stopSelfHealing(): void {
  if (globalSelfHealing) {
    globalSelfHealing.stop();
  }
}
