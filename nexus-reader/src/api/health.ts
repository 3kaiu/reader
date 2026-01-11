/**
 * 🏥 Health API - 健康检查API端点
 * 为Nexus Reader应用提供健康检查接口
 */

import { performanceSystem } from '../utils/performanceIntegration'
import { storageHealth } from '../utils/storageHealth'
import { globalMemoryManager } from '../utils/memoryManager'
import { networkDetector } from '../utils/networkOptimizer'
import { offlineManager } from '../utils/offlineManager'

export interface HealthResponse {
  status: 'healthy' | 'warning' | 'critical' | 'unknown'
  timestamp: string
  version: string
  uptime: number
  components: {
    [key: string]: {
      status: 'healthy' | 'warning' | 'critical' | 'unknown'
      message: string
      details?: any
      responseTime?: number
    }
  }
  resources: {
    memory: number
    storage: number
    network: string
  }
  performance: {
    score: number
    metrics: any
  }
}

/**
 * 执行健康检查
 */
export async function performHealthCheck(): Promise<HealthResponse> {
  const startTime = Date.now()
  const timestamp = new Date().toISOString()
  
  // 获取应用版本
  const version = import.meta.env.VITE_APP_VERSION || '1.0.0'
  
  // 计算运行时间（基于页面加载时间）
  const uptime = Date.now() - (window.performance?.timing?.navigationStart || Date.now())
  
  const components: HealthResponse['components'] = {}
  
  // 检查存储系统
  try {
    const storageStatus = await storageHealth.getStatus()
    const usagePercent = storageStatus.estimate.usage && storageStatus.estimate.quota
      ? (storageStatus.estimate.usage / storageStatus.estimate.quota) * 100
      : 0
    
    let status: 'healthy' | 'warning' | 'critical'
    if (usagePercent < 70) {
      status = 'healthy'
    } else if (usagePercent < 90) {
      status = 'warning'
    } else {
      status = 'critical'
    }
    
    components.storage = {
      status,
      message: `Storage usage: ${usagePercent.toFixed(1)}%`,
      details: {
        usage: storageStatus.estimate.usage,
        quota: storageStatus.estimate.quota,
        usagePercent,
        indexedDBSize: storageStatus.indexedDBSize,
        opfsFiles: storageStatus.opfsFiles.length,
        cacheNames: storageStatus.cacheNames.length
      },
      responseTime: Date.now() - startTime
    }
  } catch (error) {
    components.storage = {
      status: 'critical',
      message: `Storage check failed: ${error}`,
      responseTime: Date.now() - startTime
    }
  }
  
  // 检查内存系统
  try {
    const memoryUsage = globalMemoryManager.getCurrentUsage()
    
    let status: 'healthy' | 'warning' | 'critical'
    if (memoryUsage < 100) {
      status = 'healthy'
    } else if (memoryUsage < 200) {
      status = 'warning'
    } else {
      status = 'critical'
    }
    
    components.memory = {
      status,
      message: `Memory usage: ${memoryUsage}MB`,
      details: {
        usage: memoryUsage,
        gcCount: globalMemoryManager.getGCCount?.() || 0
      },
      responseTime: Date.now() - startTime
    }
  } catch (error) {
    components.memory = {
      status: 'critical',
      message: `Memory check failed: ${error}`,
      responseTime: Date.now() - startTime
    }
  }
  
  // 检查网络系统
  try {
    const isOnline = navigator.onLine
    const quality = networkDetector.getConnectionQuality()
    
    let status: 'healthy' | 'warning' | 'critical'
    if (!isOnline) {
      status = 'critical'
    } else if (quality === 'slow') {
      status = 'warning'
    } else {
      status = 'healthy'
    }
    
    components.network = {
      status,
      message: `Network: ${isOnline ? 'online' : 'offline'}, Quality: ${quality}`,
      details: {
        online: isOnline,
        quality,
        connection: (navigator as any).connection ? {
          effectiveType: (navigator as any).connection.effectiveType,
          downlink: (navigator as any).connection.downlink,
          rtt: (navigator as any).connection.rtt
        } : null
      },
      responseTime: Date.now() - startTime
    }
  } catch (error) {
    components.network = {
      status: 'critical',
      message: `Network check failed: ${error}`,
      responseTime: Date.now() - startTime
    }
  }
  
  // 检查性能系统
  try {
    const systemStatus = performanceSystem.getSystemStatus()
    const healthScore = calculatePerformanceHealth(systemStatus)
    
    let status: 'healthy' | 'warning' | 'critical'
    if (healthScore >= 80) {
      status = 'healthy'
    } else if (healthScore >= 60) {
      status = 'warning'
    } else {
      status = 'critical'
    }
    
    components.performance = {
      status,
      message: `Performance health: ${healthScore}%`,
      details: systemStatus,
      responseTime: Date.now() - startTime
    }
  } catch (error) {
    components.performance = {
      status: 'critical',
      message: `Performance check failed: ${error}`,
      responseTime: Date.now() - startTime
    }
  }
  
  // 检查离线系统
  try {
    const isInitialized = offlineManager.isInitialized()
    
    components.offline = {
      status: isInitialized ? 'healthy' : 'warning',
      message: `Offline support: ${isInitialized ? 'active' : 'inactive'}`,
      details: {
        initialized: isInitialized,
        serviceWorkerActive: 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null
      },
      responseTime: Date.now() - startTime
    }
  } catch (error) {
    components.offline = {
      status: 'critical',
      message: `Offline check failed: ${error}`,
      responseTime: Date.now() - startTime
    }
  }
  
  // 检查基本浏览器功能
  try {
    const features = {
      localStorage: typeof localStorage !== 'undefined',
      sessionStorage: typeof sessionStorage !== 'undefined',
      indexedDB: typeof indexedDB !== 'undefined',
      serviceWorker: 'serviceWorker' in navigator,
      webWorker: typeof Worker !== 'undefined',
      fetch: typeof fetch !== 'undefined',
      webGL: !!document.createElement('canvas').getContext('webgl'),
      webGPU: 'gpu' in navigator
    }
    
    const missingFeatures = Object.entries(features)
      .filter(([_, supported]) => !supported)
      .map(([feature]) => feature)
    
    components.browser = {
      status: missingFeatures.length === 0 ? 'healthy' : 'warning',
      message: missingFeatures.length === 0 
        ? 'All browser features supported'
        : `Missing features: ${missingFeatures.join(', ')}`,
      details: features,
      responseTime: Date.now() - startTime
    }
  } catch (error) {
    components.browser = {
      status: 'critical',
      message: `Browser check failed: ${error}`,
      responseTime: Date.now() - startTime
    }
  }
  
  // 计算整体状态
  const componentStatuses = Object.values(components).map(c => c.status)
  const criticalCount = componentStatuses.filter(s => s === 'critical').length
  const warningCount = componentStatuses.filter(s => s === 'warning').length
  
  let overallStatus: HealthResponse['status']
  if (criticalCount > 0) {
    overallStatus = 'critical'
  } else if (warningCount > 0) {
    overallStatus = 'warning'
  } else {
    overallStatus = 'healthy'
  }
  
  // 获取资源使用情况
  const resources = {
    memory: globalMemoryManager.getCurrentUsage() || 0,
    storage: 0, // 将在存储检查中计算
    network: networkDetector.getConnectionQuality()
  }
  
  // 更新存储使用情况
  if (components.storage?.details?.usagePercent) {
    resources.storage = components.storage.details.usagePercent
  }
  
  // 获取性能信息
  const performanceScore = components.performance?.details ? 
    calculatePerformanceHealth(components.performance.details) : 0
  
  const performanceMetrics = components.performance?.details || {}
  
  return {
    status: overallStatus,
    timestamp,
    version,
    uptime,
    components,
    resources,
    performance: {
      score: performanceScore,
      metrics: performanceMetrics
    }
  }
}

/**
 * 计算性能健康得分
 */
function calculatePerformanceHealth(systemStatus: any): number {
  let score = 100

  // 检查各个性能指标
  if (!systemStatus.monitoring?.active) score -= 10
  if (systemStatus.memory?.usage > 150) score -= 20
  if (systemStatus.caching?.hitRate < 0.5) score -= 15
  if (systemStatus.network?.averageResponseTime > 1000) score -= 20
  if (systemStatus.budget?.violations > 5) score -= 25
  if (systemStatus.animations?.averageFps < 30) score -= 10

  return Math.max(0, score)
}

/**
 * 创建健康检查API端点
 */
export function createHealthEndpoint() {
  return {
    async get() {
      try {
        const health = await performHealthCheck()
        const statusCode = health.status === 'healthy' ? 200 : 503
        
        return new Response(JSON.stringify(health, null, 2), {
          status: statusCode,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
      } catch (error) {
        return new Response(JSON.stringify({
          status: 'critical',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
          components: {}
        }, null, 2), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        })
      }
    }
  }
}

/**
 * 简单的健康检查函数（用于快速检查）
 */
export async function quickHealthCheck(): Promise<'healthy' | 'warning' | 'critical'> {
  try {
    // 快速检查关键系统
    const checks = await Promise.allSettled([
      // 存储检查
      storageHealth.getStatus(),
      // 内存检查
      Promise.resolve(globalMemoryManager.getCurrentUsage()),
      // 网络检查
      Promise.resolve(navigator.onLine)
    ])
    
    let criticalCount = 0
    let warningCount = 0
    
    // 存储检查结果
    if (checks[0].status === 'fulfilled') {
      const storageStatus = checks[0].value
      const usagePercent = storageStatus.estimate.usage && storageStatus.estimate.quota
        ? (storageStatus.estimate.usage / storageStatus.estimate.quota) * 100
        : 0
      
      if (usagePercent > 90) criticalCount++
      else if (usagePercent > 70) warningCount++
    } else {
      criticalCount++
    }
    
    // 内存检查结果
    if (checks[1].status === 'fulfilled') {
      const memoryUsage = checks[1].value
      if (memoryUsage > 200) criticalCount++
      else if (memoryUsage > 100) warningCount++
    } else {
      criticalCount++
    }
    
    // 网络检查结果
    if (checks[2].status === 'fulfilled') {
      const isOnline = checks[2].value
      if (!isOnline) criticalCount++
    } else {
      criticalCount++
    }
    
    // 确定整体状态
    if (criticalCount > 0) return 'critical'
    if (warningCount > 0) return 'warning'
    return 'healthy'
    
  } catch (error) {
    console.error('Quick health check failed:', error)
    return 'critical'
  }
}