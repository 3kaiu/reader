import { computed, type Ref } from 'vue'
import type { RuntimeCacheStats, RuntimeLoadingStep } from './types'

export function normalizeCacheStats(stats: RuntimeCacheStats): RuntimeCacheStats | null {
  return stats.modelCount > 0 || stats.totalSize > 0 ? stats : null
}

export function getLoadingTitle(progress: number): string {
  if (progress < 30) return '正在加载AI运行时...'
  if (progress < 80) return '正在准备模型资源...'
  if (progress < 95) return '正在校验模型资源...'
  return '正在初始化AI引擎...'
}

export function createLoadingTitle(loadProgress: Ref<number>) {
  return computed(() => getLoadingTitle(loadProgress.value))
}

export function createLoadingSteps(loadProgress: Ref<number>) {
  return computed<RuntimeLoadingStep[]>(() => [
    {
      key: 'runtime',
      label: 'AI库加载',
      complete: loadProgress.value >= 30,
    },
    {
      key: 'assets',
      label: '资源准备',
      complete: loadProgress.value >= 80,
    },
    {
      key: 'engine',
      label: '初始化',
      complete: loadProgress.value >= 95,
    },
  ])
}
