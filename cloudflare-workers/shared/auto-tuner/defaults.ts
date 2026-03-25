import { SMART_CACHE_CONFIGS } from '../smart-cache.ts'
import type { AutoTunerConfig, TunableParameter } from './types.ts'

export function createDefaultAutoTunerConfig(): AutoTunerConfig {
  return {
    tuningInterval: 300000,
    minSamples: 100,
    performanceThresholds: {
      targetResponseTime: 500,
      targetCacheHitRate: 0.8,
      targetErrorRate: 0.02,
      maxCpuUsage: 0.7,
      maxMemoryUsage: 0.8,
    },
    tuningStrategy: {
      aggressive: false,
      stepSize: 0.1,
      maxAdjustment: 0.5,
      cooldownPeriod: 60000,
    },
  }
}

export function createDefaultParameters(): TunableParameter[] {
  return [
    {
      name: 'cache.ttl',
      currentValue: SMART_CACHE_CONFIGS.DECODE_RESULTS.ttl,
      minValue: 300,
      maxValue: 86400,
      step: 300,
      description: '缓存TTL时间',
      impact: 'performance',
    },
    {
      name: 'cache.hitRateThreshold',
      currentValue: SMART_CACHE_CONFIGS.DECODE_RESULTS.hitRateThreshold,
      minValue: 0.5,
      maxValue: 0.95,
      step: 0.05,
      description: '缓存命中率阈值',
      impact: 'performance',
    },
    {
      name: 'ai.maxCallsPerMinute',
      currentValue: 30,
      minValue: 10,
      maxValue: 100,
      step: 5,
      description: '每分钟最大AI调用次数',
      impact: 'cost',
    },
    {
      name: 'ai.confidenceThreshold',
      currentValue: 0.7,
      minValue: 0.3,
      maxValue: 0.95,
      step: 0.05,
      description: 'AI结果置信度阈值',
      impact: 'accuracy',
    },
    {
      name: 'dict.maxGlobalEntries',
      currentValue: 5000,
      minValue: 1000,
      maxValue: 10000,
      step: 500,
      description: '全局词典最大条目数',
      impact: 'memory',
    },
    {
      name: 'dict.maxBookEntries',
      currentValue: 500,
      minValue: 100,
      maxValue: 2000,
      step: 50,
      description: '书籍词典最大条目数',
      impact: 'memory',
    },
    {
      name: 'concurrency.maxConcurrentRequests',
      currentValue: 10,
      minValue: 3,
      maxValue: 50,
      step: 2,
      description: '最大并发请求数',
      impact: 'performance',
    },
  ]
}
