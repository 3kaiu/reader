/**
 * Performance Monitor Composable
 *
 * Provides performance monitoring and metrics collection
 * for the Nexus Reader application.
 */

import { reactive, readonly } from 'vue'

export interface PerformanceMetric {
  name: string
  value: number
  unit: string
  timestamp: number
  tags?: Record<string, string>
}

export interface PerformanceConfig {
  enabled: boolean
  sampleRate: number
  maxMetrics: number
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private config: PerformanceConfig
  private metrics: PerformanceMetric[] = []

  private constructor() {
    this.config = {
      enabled: true,
      sampleRate: 0.1, // 10% sampling
      maxMetrics: 1000,
    }
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  record(metric: Omit<PerformanceMetric, 'timestamp'>): void {
    if (!this.config.enabled) return
    if (Math.random() > this.config.sampleRate) return

    const fullMetric: PerformanceMetric = {
      ...metric,
      timestamp: Date.now(),
    }

    this.metrics.push(fullMetric)

    // Keep only recent metrics
    if (this.metrics.length > this.config.maxMetrics) {
      this.metrics = this.metrics.slice(-this.config.maxMetrics)
    }

    // In development, log to console
    if (import.meta.env.DEV) {
      console.log(`[Performance] ${metric.name}: ${metric.value}${metric.unit}`, metric.tags)
    }
  }

  getMetrics(name?: string, limit = 100): PerformanceMetric[] {
    let filtered = this.metrics
    if (name) {
      filtered = filtered.filter(m => m.name === name)
    }
    return filtered.slice(-limit)
  }

  getStats(name?: string) {
    const metrics = this.getMetrics(name)
    if (metrics.length === 0) return null

    const values = metrics.map(m => m.value)
    return {
      count: metrics.length,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      latest: values[values.length - 1],
    }
  }

  clear(): void {
    this.metrics = []
  }
}

const performanceMonitor = PerformanceMonitor.getInstance()

export function useGlobalPerformanceMonitor() {
  return performanceMonitor
}

export function usePerformanceMonitor() {
  const state = reactive({
    isEnabled: true,
    metricsCount: 0,
    lastMetric: null as PerformanceMetric | null,
  })

  const record = (metric: Omit<PerformanceMetric, 'timestamp'>) => {
    performanceMonitor.record(metric)
    state.metricsCount = performanceMonitor.getMetrics().length
    state.lastMetric = { ...metric, timestamp: Date.now() }
  }

  const getStats = (name?: string) => {
    return performanceMonitor.getStats(name)
  }

  return {
    record,
    getStats,
    clear: () => performanceMonitor.clear(),
    getMetrics: (name?: string) => performanceMonitor.getMetrics(name),
    state: readonly(state),
  }
}
