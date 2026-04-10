import type { NetworkQuality, RequestOptimizationConfig } from '../types'

export const REQUEST_OPTIMIZATION_CONFIGS = {
  excellent: {
    maxRetries: 3,
    baseDelay: 100,
    maxDelay: 2000,
    jitterFactor: 0.1,
    timeout: 10000,
  },
  good: {
    maxRetries: 3,
    baseDelay: 200,
    maxDelay: 3000,
    jitterFactor: 0.2,
    timeout: 15000,
  },
  fair: {
    maxRetries: 4,
    baseDelay: 500,
    maxDelay: 5000,
    jitterFactor: 0.3,
    timeout: 20000,
  },
  poor: {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 8000,
    jitterFactor: 0.4,
    timeout: 30000,
  },
  offline: {
    maxRetries: 0,
    baseDelay: 0,
    maxDelay: 0,
    jitterFactor: 0,
    timeout: 5000,
  },
} as const satisfies Record<NetworkQuality, RequestOptimizationConfig>
