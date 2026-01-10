/**
 * Performance Monitor Composable
 * Vue 组合式 API 封装，用于在组件中使用性能监控
 */
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { 
  performanceMonitor, 
  type PerformanceMetrics, 
  type PerformanceError,
  type TimeRange,
  PERFORMANCE_THRESHOLDS 
} from '../utils/performanceMonitor'

export function usePerformanceMonitor() {
  // 响应式状态
  const isMonitoring = ref(false)
  const currentMetrics = ref<PerformanceMetrics | null>(null)
  const recentErrors = ref<PerformanceError[]>([])
  const metricsHistory = ref<PerformanceMetrics[]>([])

  // 计算属性
  const performanceScore = computed(() => {
    if (!currentMetrics.value) return 0
    
    const metrics = currentMetrics.value
    let score = 100
    
    // LCP 评分 (权重: 25%)
    if (metrics.lcp) {
      if (metrics.lcp > PERFORMANCE_THRESHOLDS.lcp * 2) score -= 25
      else if (metrics.lcp > PERFORMANCE_THRESHOLDS.lcp) score -= 15
      else if (metrics.lcp > PERFORMANCE_THRESHOLDS.lcp * 0.5) score -= 5
    }
    
    // FID 评分 (权重: 25%)
    if (metrics.fid) {
      if (metrics.fid > PERFORMANCE_THRESHOLDS.fid * 2) score -= 25
      else if (metrics.fid > PERFORMANCE_THRESHOLDS.fid) score -= 15
      else if (metrics.fid > PERFORMANCE_THRESHOLDS.fid * 0.5) score -= 5
    }
    
    // CLS 评分 (权重: 25%)
    if (metrics.cls) {
      if (metrics.cls > PERFORMANCE_THRESHOLDS.cls * 2) score -= 25
      else if (metrics.cls > PERFORMANCE_THRESHOLDS.cls) score -= 15
      else if (metrics.cls > PERFORMANCE_THRESHOLDS.cls * 0.5) score -= 5
    }
    
    // 内存使用评分 (权重: 25%)
    if (metrics.memoryUsage > PERFORMANCE_THRESHOLDS.memory * 1.5) score -= 25
    else if (metrics.memoryUsage > PERFORMANCE_THRESHOLDS.memory) score -= 15
    else if (metrics.memoryUsage > PERFORMANCE_THRESHOLDS.memory * 0.7) score -= 5
    
    return Math.max(0, score)
  })

  const performanceGrade = computed(() => {
    const score = performanceScore.value
    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  })

  const hasPerformanceIssues = computed(() => {
    return recentErrors.value.some(error => 
      error.severity === 'high' || error.severity === 'critical'
    )
  })

  // 方法
  const startMonitoring = () => {
    performanceMonitor.startMonitoring()
    isMonitoring.value = true
    
    // 开始定期更新指标
    updateMetrics()
    const interval = setInterval(updateMetrics, 5000)
    
    // 清理函数
    onUnmounted(() => {
      clearInterval(interval)
    })
  }

  const stopMonitoring = () => {
    performanceMonitor.stopMonitoring()
    isMonitoring.value = false
  }

  const updateMetrics = () => {
    currentMetrics.value = performanceMonitor.collectMetrics()
    
    // 更新错误列表
    const stored = localStorage.getItem('performance_errors')
    if (stored) {
      try {
        const allErrors: PerformanceError[] = JSON.parse(stored)
        // 只显示最近1小时的错误
        const oneHourAgo = Date.now() - 60 * 60 * 1000
        recentErrors.value = allErrors.filter(error => error.timestamp > oneHourAgo)
      } catch (e) {
        console.error('Failed to parse performance errors:', e)
      }
    }
  }

  const getMetricsHistory = (timeRange: TimeRange) => {
    metricsHistory.value = performanceMonitor.getMetricsHistory(timeRange)
    return metricsHistory.value
  }

  const reportCustomMetric = (name: string, value: number, context?: any) => {
    performanceMonitor.reportMetric(name, value, context)
  }

  // 便捷方法：报告页面加载时间
  const reportPageLoad = (pageName: string, loadTime: number) => {
    reportCustomMetric('page_load', loadTime, { page: pageName })
  }

  // 便捷方法：报告API响应时间
  const reportApiResponse = (endpoint: string, responseTime: number, status: number) => {
    reportCustomMetric('api_response', responseTime, { 
      endpoint, 
      status,
      success: status >= 200 && status < 300
    })
  }

  // 便捷方法：报告用户交互延迟
  const reportInteractionDelay = (interaction: string, delay: number) => {
    reportCustomMetric('interaction_delay', delay, { interaction })
  }

  // 便捷方法：报告内存使用情况
  const reportMemoryUsage = () => {
    if ('memory' in performance) {
      const memory = (performance as any).memory
      const memoryMB = memory.usedJSHeapSize / 1024 / 1024
      reportCustomMetric('memory_usage', memoryMB, {
        total: memory.totalJSHeapSize / 1024 / 1024,
        limit: memory.jsHeapSizeLimit / 1024 / 1024
      })
    }
  }

  // 获取性能建议
  const getPerformanceRecommendations = () => {
    const recommendations: string[] = []
    
    if (!currentMetrics.value) return recommendations
    
    const metrics = currentMetrics.value
    
    if (metrics.lcp && metrics.lcp > PERFORMANCE_THRESHOLDS.lcp) {
      recommendations.push('优化最大内容绘制时间：考虑压缩图片、使用CDN或优化关键渲染路径')
    }
    
    if (metrics.fid && metrics.fid > PERFORMANCE_THRESHOLDS.fid) {
      recommendations.push('减少首次输入延迟：优化JavaScript执行时间，考虑代码分割')
    }
    
    if (metrics.cls && metrics.cls > PERFORMANCE_THRESHOLDS.cls) {
      recommendations.push('减少累积布局偏移：为图片和广告预留空间，避免动态插入内容')
    }
    
    if (metrics.memoryUsage > PERFORMANCE_THRESHOLDS.memory) {
      recommendations.push('优化内存使用：清理未使用的对象，检查内存泄漏')
    }
    
    if (metrics.apiResponseTime > PERFORMANCE_THRESHOLDS.apiResponse) {
      recommendations.push('优化API响应时间：考虑缓存、数据库优化或使用CDN')
    }
    
    return recommendations
  }

  // 导出性能报告
  const exportPerformanceReport = () => {
    const report = {
      timestamp: Date.now(),
      currentMetrics: currentMetrics.value,
      performanceScore: performanceScore.value,
      performanceGrade: performanceGrade.value,
      recentErrors: recentErrors.value,
      recommendations: getPerformanceRecommendations(),
      userAgent: navigator.userAgent,
      url: window.location.href
    }
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { 
      type: 'application/json' 
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `performance-report-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 组件挂载时自动开始监控
  onMounted(() => {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development') {
      startMonitoring()
    }
  })

  // 组件卸载时停止监控
  onUnmounted(() => {
    if (isMonitoring.value) {
      stopMonitoring()
    }
  })

  return {
    // 状态
    isMonitoring,
    currentMetrics,
    recentErrors,
    metricsHistory,
    
    // 计算属性
    performanceScore,
    performanceGrade,
    hasPerformanceIssues,
    
    // 方法
    startMonitoring,
    stopMonitoring,
    updateMetrics,
    getMetricsHistory,
    reportCustomMetric,
    reportPageLoad,
    reportApiResponse,
    reportInteractionDelay,
    reportMemoryUsage,
    getPerformanceRecommendations,
    exportPerformanceReport
  }
}

// 全局性能监控钩子（用于应用级别的监控）
export function useGlobalPerformanceMonitor() {
  const { 
    reportPageLoad, 
    reportApiResponse, 
    reportInteractionDelay,
    reportMemoryUsage,
    reportCustomMetric
  } = usePerformanceMonitor()

  // 监控路由变化
  const monitorRouteChange = (from: string, to: string, duration: number) => {
    reportCustomMetric('route_change', duration, { from, to })
  }

  // 监控组件渲染时间
  const monitorComponentRender = (componentName: string, renderTime: number) => {
    reportCustomMetric('component_render', renderTime, { component: componentName })
  }

  // 监控异步操作
  const monitorAsyncOperation = async <T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> => {
    const startTime = performance.now()
    try {
      const result = await operation()
      const duration = performance.now() - startTime
      reportCustomMetric('async_operation', duration, { 
        operation: operationName,
        success: true 
      })
      return result
    } catch (error) {
      const duration = performance.now() - startTime
      reportCustomMetric('async_operation', duration, { 
        operation: operationName,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  return {
    reportPageLoad,
    reportApiResponse,
    reportInteractionDelay,
    reportMemoryUsage,
    reportCustomMetric,
    monitorRouteChange,
    monitorComponentRender,
    monitorAsyncOperation
  }
}