import { ServerlessOptimizationExecutor } from './executor.ts'
import type { FunctionOptimization, ServerlessConfig } from './types.ts'

export function createDefaultServerlessConfig(): ServerlessConfig {
  return {
    memoryLimit: 128,
    cpuLimit: 100,
    timeoutLimit: 30000,
    concurrencyLimit: 100,
    cacheStrategy: 'balanced',
    preloadFunctions: ['auth', 'cache', 'api'],
    optimizeBundles: true,
  }
}

export function createFunctionOptimizations(
  executor: ServerlessOptimizationExecutor
): FunctionOptimization[] {
  return [
    {
      functionName: 'auth',
      optimizationType: 'caching',
      impact: 85,
      implementation: () => executor.optimizeAuthCaching(),
    },
    {
      functionName: 'api',
      optimizationType: 'bundling',
      impact: 60,
      implementation: () => executor.optimizeApiBundling(),
    },
    {
      functionName: 'cache',
      optimizationType: 'memory',
      impact: 75,
      implementation: () => executor.optimizeMemoryCaching(),
    },
    {
      functionName: 'computation',
      optimizationType: 'computation',
      impact: 50,
      implementation: () => executor.optimizeComputation(),
    },
    {
      functionName: 'network',
      optimizationType: 'network',
      impact: 40,
      implementation: () => executor.optimizeNetwork(),
    },
  ]
}
