/**
 * 🏥 useHealthMonitor Hook
 * React Hook for system health monitoring integration
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  healthMonitor, 
  SystemHealthStatus, 
  HealthAlert, 
  HealthMonitorConfig,
  getSystemHealth,
  getHealthHistory,
  getActiveHealthAlerts,
  triggerHealthCheck
} from '../utils/healthMonitor'

export interface UseHealthMonitorOptions {
  autoRefresh?: boolean
  refreshInterval?: number
  enableNotifications?: boolean
  onHealthChange?: (status: SystemHealthStatus) => void
  onAlert?: (alert: HealthAlert) => void
}

export interface UseHealthMonitorReturn {
  // 状态数据
  currentHealth: SystemHealthStatus | null
  healthHistory: SystemHealthStatus[]
  activeAlerts: HealthAlert[]
  isLoading: boolean
  error: string | null
  
  // 操作函数
  refreshHealth: () => Promise<void>
  triggerCheck: () => Promise<void>
  resolveAlert: (alertId: string) => void
  getComponentHealth: (componentName: string) => any
  
  // 统计信息
  systemStats: any
  healthTrend: 'improving' | 'stable' | 'degrading' | 'unknown'
}

export function useHealthMonitor(options: UseHealthMonitorOptions = {}): UseHealthMonitorReturn {
  const {
    autoRefresh = true,
    refreshInterval = 60000, // 1分钟
    enableNotifications = false,
    onHealthChange,
    onAlert
  } = options

  // 状态管理
  const [currentHealth, setCurrentHealth] = useState<SystemHealthStatus | null>(null)
  const [healthHistory, setHealthHistory] = useState<SystemHealthStatus[]>([])
  const [activeAlerts, setActiveAlerts] = useState<HealthAlert[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [systemStats, setSystemStats] = useState<any>(null)

  // Refs
  const refreshIntervalRef = useRef<number>()
  const lastHealthRef = useRef<SystemHealthStatus | null>(null)

  // 刷新健康状态
  const refreshHealth = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // 获取当前健康状态
      const health = await getSystemHealth()
      setCurrentHealth(health)

      // 获取历史数据
      const history = getHealthHistory(24) // 最近24小时
      setHealthHistory(history)

      // 获取活跃告警
      const alerts = getActiveHealthAlerts()
      setActiveAlerts(alerts)

      // 获取系统统计
      const stats = healthMonitor.getSystemStats()
      setSystemStats(stats)

      // 检查健康状态变化
      if (lastHealthRef.current && onHealthChange) {
        if (lastHealthRef.current.overall !== health.overall || 
            Math.abs(lastHealthRef.current.score - health.score) > 10) {
          onHealthChange(health)
        }
      }

      // 检查新告警
      if (onAlert) {
        const newAlerts = alerts.filter(alert => 
          !lastHealthRef.current?.alerts.some(oldAlert => oldAlert.id === alert.id)
        )
        newAlerts.forEach(alert => onAlert(alert))
      }

      lastHealthRef.current = health

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      console.error('[useHealthMonitor] Failed to refresh health:', err)
    } finally {
      setIsLoading(false)
    }
  }, [onHealthChange, onAlert])

  // 触发健康检查
  const triggerCheck = useCallback(async () => {
    try {
      setIsLoading(true)
      const health = await triggerHealthCheck()
      setCurrentHealth(health)
      
      // 刷新其他数据
      await refreshHealth()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      console.error('[useHealthMonitor] Failed to trigger health check:', err)
    } finally {
      setIsLoading(false)
    }
  }, [refreshHealth])

  // 解决告警
  const resolveAlert = useCallback((alertId: string) => {
    healthMonitor.resolveAlert(alertId)
    // 立即刷新告警列表
    const updatedAlerts = getActiveHealthAlerts()
    setActiveAlerts(updatedAlerts)
  }, [])

  // 获取特定组件的健康状态
  const getComponentHealth = useCallback((componentName: string) => {
    if (!currentHealth) return null
    return currentHealth.components.find(c => c.component === componentName)
  }, [currentHealth])

  // 计算健康趋势
  const healthTrend = useCallback((): 'improving' | 'stable' | 'degrading' | 'unknown' => {
    if (healthHistory.length < 3) return 'unknown'

    const recent = healthHistory.slice(-3)
    const scores = recent.map(h => h.score)
    
    const trend = scores[2] - scores[0]
    if (trend > 5) return 'improving'
    if (trend < -5) return 'degrading'
    return 'stable'
  }, [healthHistory])

  // 设置浏览器通知权限
  useEffect(() => {
    if (enableNotifications && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            console.log('[useHealthMonitor] Notification permission granted')
          }
        })
      }
    }
  }, [enableNotifications])

  // 初始化和自动刷新
  useEffect(() => {
    // 立即加载一次
    refreshHealth()

    // 设置自动刷新
    if (autoRefresh) {
      refreshIntervalRef.current = window.setInterval(refreshHealth, refreshInterval)
    }

    // 清理函数
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [refreshHealth, autoRefresh, refreshInterval])

  // 监听页面可见性变化
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && autoRefresh) {
        // 页面重新可见时刷新数据
        refreshHealth()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshHealth, autoRefresh])

  return {
    // 状态数据
    currentHealth,
    healthHistory,
    activeAlerts,
    isLoading,
    error,
    
    // 操作函数
    refreshHealth,
    triggerCheck,
    resolveAlert,
    getComponentHealth,
    
    // 统计信息
    systemStats,
    healthTrend: healthTrend()
  }
}

// 健康状态工具函数
export function getHealthStatusColor(status: SystemHealthStatus['overall']): string {
  switch (status) {
    case 'healthy': return '#10B981' // green-500
    case 'warning': return '#F59E0B' // amber-500
    case 'critical': return '#EF4444' // red-500
    case 'unknown': return '#6B7280' // gray-500
    default: return '#6B7280'
  }
}

export function getHealthStatusIcon(status: SystemHealthStatus['overall']): string {
  switch (status) {
    case 'healthy': return '✅'
    case 'warning': return '⚠️'
    case 'critical': return '🚨'
    case 'unknown': return '❓'
    default: return '❓'
  }
}

export function formatUptime(uptime: number): string {
  const seconds = Math.floor(uptime / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

export function formatHealthScore(score: number): string {
  if (score >= 90) return `${score}% (Excellent)`
  if (score >= 80) return `${score}% (Good)`
  if (score >= 70) return `${score}% (Fair)`
  if (score >= 60) return `${score}% (Poor)`
  return `${score}% (Critical)`
}

// 健康检查配置 Hook
export function useHealthMonitorConfig() {
  const [config, setConfig] = useState<Partial<HealthMonitorConfig>>({})

  const updateConfig = useCallback((newConfig: Partial<HealthMonitorConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }))
    
    // 这里可以持久化配置到 localStorage
    try {
      localStorage.setItem('health-monitor-config', JSON.stringify({ ...config, ...newConfig }))
    } catch (error) {
      console.warn('[useHealthMonitorConfig] Failed to save config:', error)
    }
  }, [config])

  // 加载保存的配置
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('health-monitor-config')
      if (savedConfig) {
        setConfig(JSON.parse(savedConfig))
      }
    } catch (error) {
      console.warn('[useHealthMonitorConfig] Failed to load config:', error)
    }
  }, [])

  return {
    config,
    updateConfig
  }
}