/**
 * Auto Tuner (自动调优系统)
 * 基于运行时数据自动调整系统参数，持续优化性能
 */

import { getPerformanceMonitor } from './performance-monitor.ts';
import { SmartCache, SMART_CACHE_CONFIGS } from './smart-cache.ts';

export interface AutoTunerConfig {
  // 调优周期 (毫秒)
  tuningInterval: number;

  // 最小样本数 (调优前需要的最少数据点)
  minSamples: number;

  // 性能阈值
  performanceThresholds: {
    targetResponseTime: number;    // 目标响应时间 (ms)
    targetCacheHitRate: number;    // 目标缓存命中率
    targetErrorRate: number;       // 目标错误率
    maxCpuUsage: number;          // 最大CPU使用率
    maxMemoryUsage: number;       // 最大内存使用率
  };

  // 调优策略
  tuningStrategy: {
    aggressive: boolean;          // 是否激进调优
    stepSize: number;             // 参数调整步长
    maxAdjustment: number;        // 最大调整幅度
    cooldownPeriod: number;       // 调优冷却期
  };
}

export interface TunableParameter {
  name: string;
  currentValue: number;
  minValue: number;
  maxValue: number;
  step: number;
  description: string;
  impact: 'performance' | 'memory' | 'accuracy' | 'cost';
}

export class AutoTuner {
  private config: AutoTunerConfig;
  private parameters: Map<string, TunableParameter> = new Map();
  private tuningTimer: number | null = null;
  private lastTuningTime = 0;
  private tuningHistory: Array<{
    timestamp: number;
    parameter: string;
    oldValue: number;
    newValue: number;
    reason: string;
    impact: number;
  }> = [];

  constructor(config: Partial<AutoTunerConfig> = {}) {
    this.config = {
      tuningInterval: 300000, // 5分钟
      minSamples: 100,
      performanceThresholds: {
        targetResponseTime: 500,
        targetCacheHitRate: 0.8,
        targetErrorRate: 0.02,
        maxCpuUsage: 0.7,
        maxMemoryUsage: 0.8
      },
      tuningStrategy: {
        aggressive: false,
        stepSize: 0.1,
        maxAdjustment: 0.5,
        cooldownPeriod: 60000 // 1分钟
      },
      ...config
    };

    this.initializeParameters();
  }

  private initializeParameters(): void {
    // 缓存相关参数
    this.registerParameter({
      name: 'cache.ttl',
      currentValue: SMART_CACHE_CONFIGS.DECODE_RESULTS.ttl,
      minValue: 300,    // 5分钟
      maxValue: 86400,  // 24小时
      step: 300,        // 5分钟步长
      description: '缓存TTL时间',
      impact: 'performance'
    });

    this.registerParameter({
      name: 'cache.hitRateThreshold',
      currentValue: SMART_CACHE_CONFIGS.DECODE_RESULTS.hitRateThreshold,
      minValue: 0.5,
      maxValue: 0.95,
      step: 0.05,
      description: '缓存命中率阈值',
      impact: 'performance'
    });

    // AI相关参数
    this.registerParameter({
      name: 'ai.maxCallsPerMinute',
      currentValue: 30,
      minValue: 10,
      maxValue: 100,
      step: 5,
      description: '每分钟最大AI调用次数',
      impact: 'cost'
    });

    this.registerParameter({
      name: 'ai.confidenceThreshold',
      currentValue: 0.7,
      minValue: 0.3,
      maxValue: 0.95,
      step: 0.05,
      description: 'AI结果置信度阈值',
      impact: 'accuracy'
    });

    // 词典相关参数
    this.registerParameter({
      name: 'dict.maxGlobalEntries',
      currentValue: 5000,
      minValue: 1000,
      maxValue: 10000,
      step: 500,
      description: '全局词典最大条目数',
      impact: 'memory'
    });

    this.registerParameter({
      name: 'dict.maxBookEntries',
      currentValue: 500,
      minValue: 100,
      maxValue: 2000,
      step: 50,
      description: '书籍词典最大条目数',
      impact: 'memory'
    });

    // 并发相关参数
    this.registerParameter({
      name: 'concurrency.maxConcurrentRequests',
      currentValue: 10,
      minValue: 3,
      maxValue: 50,
      step: 2,
      description: '最大并发请求数',
      impact: 'performance'
    });
  }

  private registerParameter(param: TunableParameter): void {
    this.parameters.set(param.name, param);
  }

  // 开始自动调优
  start(): void {
    if (this.tuningTimer) return;

    this.tuningTimer = setInterval(() => {
      this.performTuning();
    }, this.config.tuningInterval);

    console.log('Auto tuner started with interval:', this.config.tuningInterval);
  }

  // 停止自动调优
  stop(): void {
    if (this.tuningTimer) {
      clearInterval(this.tuningTimer);
      this.tuningTimer = null;
      console.log('Auto tuner stopped');
    }
  }

  // 执行调优
  private async performTuning(): Promise<void> {
    const now = Date.now();

    // 检查冷却期
    if (now - this.lastTuningTime < this.config.tuningStrategy.cooldownPeriod) {
      return;
    }

    const monitor = getPerformanceMonitor();
    const metrics = monitor.getAggregatedMetrics(300000); // 最近5分钟数据

    // 检查是否有足够的数据
    const totalRequests = Object.values(metrics).reduce((sum, m) => sum + m.totalRequests, 0);
    if (totalRequests < this.config.minSamples) {
      return;
    }

    // 计算当前性能指标
    const currentMetrics = this.calculateCurrentMetrics(metrics);

    // 确定需要调优的参数
    const tuningDecisions = this.analyzePerformance(currentMetrics);

    // 应用调优
    for (const decision of tuningDecisions) {
      await this.applyTuning(decision);
    }

    this.lastTuningTime = now;
  }

  private calculateCurrentMetrics(metrics: any): any {
    const operations = Object.values(metrics);
    if (operations.length === 0) return null;

    // 加权平均计算
    const weights = operations.map((op: any) => op.totalRequests);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    return {
      avgResponseTime: operations.reduce((sum: number, op: any, i: number) =>
        sum + (op.avgDuration * weights[i]), 0) / totalWeight,

      avgErrorRate: operations.reduce((sum: number, op: any, i: number) =>
        sum + (op.errorRate * weights[i]), 0) / totalWeight,

      totalRequests: totalWeight,

      cacheHitRate: 0.75, // 从缓存服务获取

      qps: operations.reduce((sum: number, op: any, i: number) =>
        sum + (op.qps * weights[i]), 0) / totalWeight
    };
  }

  private analyzePerformance(currentMetrics: any): Array<{
    parameter: string;
    direction: 'increase' | 'decrease';
    reason: string;
    confidence: number;
  }> {
    const decisions: Array<{
      parameter: string;
      direction: 'increase' | 'decrease';
      reason: string;
      confidence: number;
    }> = [];

    // 响应时间分析
    if (currentMetrics.avgResponseTime > this.config.performanceThresholds.targetResponseTime * 1.5) {
      decisions.push({
        parameter: 'cache.ttl',
        direction: 'increase',
        reason: '响应时间过长，增加缓存时间',
        confidence: 0.8
      });

      decisions.push({
        parameter: 'concurrency.maxConcurrentRequests',
        direction: 'increase',
        reason: '响应时间过长，增加并发处理',
        confidence: 0.7
      });
    }

    // 缓存命中率分析
    if (currentMetrics.cacheHitRate < this.config.performanceThresholds.targetCacheHitRate * 0.8) {
      decisions.push({
        parameter: 'cache.hitRateThreshold',
        direction: 'decrease',
        reason: '缓存命中率过低，放宽命中阈值',
        confidence: 0.9
      });
    }

    // 错误率分析
    if (currentMetrics.avgErrorRate > this.config.performanceThresholds.targetErrorRate * 2) {
      decisions.push({
        parameter: 'ai.maxCallsPerMinute',
        direction: 'decrease',
        reason: '错误率过高，减少AI调用频率',
        confidence: 0.8
      });

      decisions.push({
        parameter: 'ai.confidenceThreshold',
        direction: 'increase',
        reason: '错误率过高，提高AI置信度阈值',
        confidence: 0.7
      });
    }

    // QPS分析
    if (currentMetrics.qps > 100) { // 高负载
      decisions.push({
        parameter: 'dict.maxGlobalEntries',
        direction: 'decrease',
        reason: '高负载情况下减少内存使用',
        confidence: 0.6
      });

      decisions.push({
        parameter: 'dict.maxBookEntries',
        direction: 'decrease',
        reason: '高负载情况下减少内存使用',
        confidence: 0.6
      });
    }

    return decisions.filter(d => d.confidence > 0.6);
  }

  private async applyTuning(decision: {
    parameter: string;
    direction: 'increase' | 'decrease';
    reason: string;
    confidence: number;
  }): Promise<void> {
    const param = this.parameters.get(decision.parameter);
    if (!param) return;

    const oldValue = param.currentValue;
    let newValue: number;

    if (this.config.tuningStrategy.aggressive) {
      // 激进模式：大步调整
      const adjustment = param.step * 2;
      newValue = decision.direction === 'increase'
        ? Math.min(param.maxValue, oldValue + adjustment)
        : Math.max(param.minValue, oldValue - adjustment);
    } else {
      // 保守模式：小步调整
      const adjustment = Math.min(
        param.step * this.config.tuningStrategy.stepSize,
        param.currentValue * this.config.tuningStrategy.maxAdjustment
      );
      newValue = decision.direction === 'increase'
        ? Math.min(param.maxValue, oldValue + adjustment)
        : Math.max(param.minValue, oldValue - adjustment);
    }

    // 只在值真正改变时应用
    if (newValue !== oldValue) {
      param.currentValue = newValue;

      // 记录调优历史
      this.tuningHistory.push({
        timestamp: Date.now(),
        parameter: decision.parameter,
        oldValue,
        newValue,
        reason: decision.reason,
        impact: decision.confidence
      });

      // 应用参数到实际系统
      await this.applyParameterToSystem(decision.parameter, newValue);

      console.log(`Auto-tuned ${decision.parameter}: ${oldValue} -> ${newValue} (${decision.reason})`);
    }
  }

  private async applyParameterToSystem(parameter: string, value: number): Promise<void> {
    // 这里实现参数应用逻辑
    switch (parameter) {
      case 'cache.ttl':
        // 更新缓存配置
        SMART_CACHE_CONFIGS.DECODE_RESULTS.ttl = value;
        break;

      case 'cache.hitRateThreshold':
        SMART_CACHE_CONFIGS.DECODE_RESULTS.hitRateThreshold = value;
        break;

      case 'ai.maxCallsPerMinute':
        // 更新AI服务限制
        // 这需要在AIService中实现动态配置
        break;

      case 'dict.maxGlobalEntries':
        // 更新词典大小限制
        // 这需要在DictionaryService中实现动态配置
        break;

      default:
        console.warn(`Unknown parameter: ${parameter}`);
    }
  }

  // 获取调优状态
  getTuningStatus(): {
    isActive: boolean;
    lastTuningTime: number;
    tuningHistory: any[];
    currentParameters: Record<string, number>;
    recommendations: string[];
  } {
    const recommendations: string[] = [];

    // 基于历史数据生成建议
    const recentTuning = this.tuningHistory.slice(-5);
    if (recentTuning.length > 0) {
      const mostTunedParam = recentTuning.reduce((acc, curr) => {
        acc[curr.parameter] = (acc[curr.parameter] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topParam = Object.entries(mostTunedParam)
        .sort(([, a], [, b]) => b - a)[0];

      if (topParam && topParam[1] > 2) {
        recommendations.push(`频繁调整参数 ${topParam[0]}，考虑手动优化该参数`);
      }
    }

    return {
      isActive: this.tuningTimer !== null,
      lastTuningTime: this.lastTuningTime,
      tuningHistory: this.tuningHistory.slice(-10), // 最近10条记录
      currentParameters: Object.fromEntries(
        Array.from(this.parameters.entries()).map(([key, param]) => [key, param.currentValue])
      ),
      recommendations
    };
  }

  // 手动触发调优
  async forceTuning(): Promise<void> {
    await this.performTuning();
  }

  // 重置所有参数到默认值
  resetToDefaults(): void {
    this.initializeParameters();
    this.tuningHistory = [];
    console.log('Auto tuner reset to defaults');
  }

  // 导出调优配置
  exportConfig(): AutoTunerConfig {
    return { ...this.config };
  }

  // 导入调优配置
  importConfig(config: AutoTunerConfig): void {
    this.config = { ...config };
  }
}

// 全局自动调优实例
let globalAutoTuner: AutoTuner | null = null;

export function getAutoTuner(config?: Partial<AutoTunerConfig>): AutoTuner {
  if (!globalAutoTuner) {
    globalAutoTuner = new AutoTuner(config);
  }
  return globalAutoTuner;
}

// 自动启动调优服务
export function startAutoTuning(config?: Partial<AutoTunerConfig>): void {
  const tuner = getAutoTuner(config);
  tuner.start();
}

// 停止调优服务
export function stopAutoTuning(): void {
  if (globalAutoTuner) {
    globalAutoTuner.stop();
  }
}