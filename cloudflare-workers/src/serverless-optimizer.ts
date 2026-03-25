/**
 * 无服务器架构优化器
 * 专门针对Cloudflare Workers的无服务器环境进行深度优化
 */

import { createDefaultServerlessConfig, createFunctionOptimizations } from './serverless-optimizer/defaults.ts'
import { ServerlessOptimizationExecutor } from './serverless-optimizer/executor.ts'
import {
  buildOptimizationStatus,
  getLatestMetric,
  recommendOptimizations,
  trimMetricsHistory,
} from './serverless-optimizer/helpers.ts'
import { analyzeBottlenecks, ServerlessMetricsCollector } from './serverless-optimizer/metrics.ts'
import type {
  FunctionOptimization,
  ServerlessConfig,
  ServerlessMetrics,
} from './serverless-optimizer/types.ts'

export class ServerlessOptimizer {
  private static instance: ServerlessOptimizer
  private metrics: ServerlessMetrics[] = []
  private optimizations: FunctionOptimization[]
  private config: ServerlessConfig
  private optimizationTasks: Map<string, Promise<void>> = new Map()
  private readonly executor = new ServerlessOptimizationExecutor()
  private readonly metricsCollector = new ServerlessMetricsCollector()

  private constructor() {
    this.config = createDefaultServerlessConfig()
    this.optimizations = createFunctionOptimizations(this.executor)
    this.startOptimizationLoop()
  }

  static getInstance(): ServerlessOptimizer {
    if (!ServerlessOptimizer.instance) {
      ServerlessOptimizer.instance = new ServerlessOptimizer()
    }
    return ServerlessOptimizer.instance
  }

  private startOptimizationLoop() {
    // 每5分钟执行一次优化检查
    setInterval(async () => {
      await this.runOptimizationCycle()
    }, 300000)
  }

  private async runOptimizationCycle() {
    try {
      const currentMetrics = await this.metricsCollector.collectMetrics()
      const bottlenecks = analyzeBottlenecks(currentMetrics, this.config)
      const recommendations = recommendOptimizations(bottlenecks, this.optimizations)

      await this.applyOptimizations(recommendations)
      await this.recordOptimizationResults(currentMetrics, recommendations)
    } catch (error) {
      console.error('[Serverless Optimizer] 优化循环错误:', error)
    }
  }

  private async applyOptimizations(optimizations: FunctionOptimization[]) {
    for (const optimization of optimizations) {
      if (!this.optimizationTasks.has(optimization.functionName)) {
        const task = optimization.implementation()
        this.optimizationTasks.set(optimization.functionName, task)

        try {
          await task
          console.log(`[Serverless Optimizer] 应用优化: ${optimization.functionName} (${optimization.impact}% 提升)`)
        } catch (error) {
          console.error(`[Serverless Optimizer] 优化失败: ${optimization.functionName}`, error)
        } finally {
          this.optimizationTasks.delete(optimization.functionName)
        }
      }
    }
  }

  private async recordOptimizationResults(
    metrics: ServerlessMetrics,
    optimizations: FunctionOptimization[]
  ) {
    this.metrics = trimMetricsHistory([...this.metrics, metrics], 1000)
    await this.executor.sendMetricsToMonitoring(metrics, optimizations)
  }

  // 公共API
  getCurrentMetrics(): ServerlessMetrics | null {
    return getLatestMetric(this.metrics)
  }

  getOptimizationHistory(): FunctionOptimization[] {
    return [...this.optimizations]
  }

  getConfig(): ServerlessConfig {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<ServerlessConfig>) {
    this.config = { ...this.config, ...newConfig }
  }

  async forceOptimization(functionName: string) {
    const optimization = this.optimizations.find(opt => opt.functionName === functionName)
    if (optimization) {
      await optimization.implementation()
    }
  }

  getOptimizationStatus(): { [key: string]: boolean } {
    return buildOptimizationStatus(this.optimizations, this.optimizationTasks)
  }
}

// 导出单例实例
export const serverlessOptimizer = ServerlessOptimizer.getInstance()
