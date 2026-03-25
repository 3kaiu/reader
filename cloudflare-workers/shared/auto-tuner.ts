/**
 * Auto Tuner (自动调优系统)
 * 基于运行时数据自动调整系统参数，持续优化性能
 */

import { calculateCurrentMetrics, analyzePerformance, getStatusRecommendations, getTotalRequests } from './auto-tuner/analysis.ts';
import { createDefaultAutoTunerConfig, createDefaultParameters } from './auto-tuner/defaults.ts';
import { applyParameterToSystem } from './auto-tuner/system.ts';
import type {
  AutoTunerConfig,
  OperationMetric,
  TunableParameter,
  TuningDecision,
  TuningHistoryEntry,
  TuningStatus,
} from './auto-tuner/types.ts';
import { getPerformanceMonitor } from './performance-monitor.ts';

export type {
  AutoTunerConfig,
  TunableParameter,
  TuningDecision,
  TuningHistoryEntry,
  TuningStatus,
} from './auto-tuner/types.ts';

export class AutoTuner {
  private config: AutoTunerConfig;
  private parameters: Map<string, TunableParameter> = new Map();
  private tuningTimer: number | null = null;
  private lastTuningTime = 0;
  private tuningHistory: TuningHistoryEntry[] = [];

  constructor(config: Partial<AutoTunerConfig> = {}) {
    this.config = {
      ...createDefaultAutoTunerConfig(),
      ...config
    };

    this.initializeParameters();
  }

  private initializeParameters(): void {
    this.parameters.clear();
    for (const parameter of createDefaultParameters()) {
      this.registerParameter(parameter);
    }
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
    const totalRequests = getTotalRequests(metrics as Record<string, OperationMetric>);
    if (totalRequests < this.config.minSamples) {
      return;
    }

    // 计算当前性能指标
    const currentMetrics = calculateCurrentMetrics(metrics as Record<string, OperationMetric>);

    // 确定需要调优的参数
    const tuningDecisions = analyzePerformance(currentMetrics, this.config);

    // 应用调优
    for (const decision of tuningDecisions) {
      await this.applyTuning(decision);
    }

    this.lastTuningTime = now;
  }

  private async applyTuning(decision: TuningDecision): Promise<void> {
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
      await applyParameterToSystem(decision.parameter, newValue);

      console.log(`Auto-tuned ${decision.parameter}: ${oldValue} -> ${newValue} (${decision.reason})`);
    }
  }

  // 获取调优状态
  getTuningStatus(): TuningStatus {
    return {
      isActive: this.tuningTimer !== null,
      lastTuningTime: this.lastTuningTime,
      tuningHistory: this.tuningHistory.slice(-10), // 最近10条记录
      currentParameters: Object.fromEntries(
        Array.from(this.parameters.entries()).map(([key, param]) => [key, param.currentValue])
      ),
      recommendations: getStatusRecommendations(this.tuningHistory)
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
