/**
 * 错误监控仪表板组件
 * 显示错误统计、告警状态和错误详情
 */

import React, { useState, useEffect, useMemo } from 'react'
import { 
  errorLogger, 
  ErrorEntry, 
  ErrorMetrics, 
  AlertNotification,
  ErrorCategory,
  ErrorSeverity 
} from '../utils/errorLogger'
import './ErrorDashboard.css'

interface ErrorDashboardProps {
  className?: string
  autoRefresh?: boolean
  refreshInterval?: number
}

const ErrorDashboard: React.FC<ErrorDashboardProps> = ({
  className = '',
  autoRefresh = true,
  refreshInterval = 30000 // 30秒
}) => {
  const [metrics, setMetrics] = useState<ErrorMetrics | null>(null)
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [alerts, setAlerts] = useState<AlertNotification[]>([])
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | 'all'>('all')
  const [selectedSeverity, setSelectedSeverity] = useState<ErrorSeverity | 'all'>('all')
  const [timeWindow, setTimeWindow] = useState<number>(60 * 60 * 1000) // 1小时
  const [isExpanded, setIsExpanded] = useState(false)

  // 刷新数据
  const refreshData = () => {
    const newMetrics = errorLogger.getMetrics(timeWindow)
    setMetrics(newMetrics)

    const errorOptions: any = { timeWindowMs: timeWindow }
    if (selectedCategory !== 'all') {
      errorOptions.category = selectedCategory
    }
    if (selectedSeverity !== 'all') {
      errorOptions.severity = selectedSeverity
    }

    const newErrors = errorLogger.getErrors(errorOptions)
    setErrors(newErrors)
  }

  // 处理告警通知
  useEffect(() => {
    const unsubscribe = errorLogger.onAlert((alert) => {
      setAlerts(prev => [alert, ...prev.slice(0, 9)]) // 保留最近10个告警
    })

    return unsubscribe
  }, [])

  // 自动刷新
  useEffect(() => {
    refreshData()

    if (autoRefresh) {
      const interval = setInterval(refreshData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, refreshInterval, timeWindow, selectedCategory, selectedSeverity])

  // 计算统计数据
  const stats = useMemo(() => {
    if (!metrics) return null

    const categoryCounts = errors.reduce((acc, error) => {
      acc[error.category] = (acc[error.category] || 0) + error.count
      return acc
    }, {} as Record<ErrorCategory, number>)

    const severityCounts = errors.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + error.count
      return acc
    }, {} as Record<ErrorSeverity, number>)

    return {
      categoryCounts,
      severityCounts,
      totalErrors: errors.reduce((sum, error) => sum + error.count, 0),
      uniqueErrors: errors.length
    }
  }, [metrics, errors])

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  const getSeverityColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return '#dc2626'
      case ErrorSeverity.HIGH: return '#ea580c'
      case ErrorSeverity.MEDIUM: return '#d97706'
      case ErrorSeverity.LOW: return '#65a30d'
      default: return '#6b7280'
    }
  }

  const getCategoryIcon = (category: ErrorCategory) => {
    switch (category) {
      case ErrorCategory.NETWORK: return '🌐'
      case ErrorCategory.API: return '🔌'
      case ErrorCategory.UI: return '🖥️'
      case ErrorCategory.STORAGE: return '💾'
      case ErrorCategory.AI: return '🤖'
      case ErrorCategory.SYNC: return '🔄'
      case ErrorCategory.AUTH: return '🔐'
      case ErrorCategory.PERFORMANCE: return '⚡'
      default: return '❓'
    }
  }

  if (!isExpanded) {
    return (
      <div className={`error-dashboard-compact ${className}`}>
        <div className="dashboard-header" onClick={() => setIsExpanded(true)}>
          <div className="dashboard-title">
            <span className="title-icon">🚨</span>
            <span>错误监控</span>
          </div>
          <div className="dashboard-summary">
            {metrics && (
              <>
                <span className="error-count">
                  {stats?.totalErrors || 0} 错误
                </span>
                <span className="error-rate">
                  {metrics.errorRate.toFixed(2)}/s
                </span>
                {alerts.length > 0 && (
                  <span className="alert-indicator">
                    {alerts.length} 告警
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`error-dashboard ${className}`}>
      <div className="dashboard-header">
        <div className="dashboard-title">
          <span className="title-icon">🚨</span>
          <span>错误监控仪表板</span>
        </div>
        <div className="dashboard-controls">
          <button onClick={refreshData} className="refresh-btn">
            🔄 刷新
          </button>
          <button onClick={() => setIsExpanded(false)} className="collapse-btn">
            ➖ 收起
          </button>
        </div>
      </div>

      {/* 告警区域 */}
      {alerts.length > 0 && (
        <div className="alerts-section">
          <h3>🔔 活跃告警</h3>
          <div className="alerts-list">
            {alerts.slice(0, 3).map(alert => (
              <div 
                key={alert.id} 
                className={`alert-item severity-${alert.severity}`}
              >
                <div className="alert-header">
                  <span className="alert-name">{alert.ruleName}</span>
                  <span className="alert-time">
                    {formatTimestamp(alert.timestamp)}
                  </span>
                </div>
                <div className="alert-message">{alert.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 指标概览 */}
      {metrics && stats && (
        <div className="metrics-section">
          <h3>📊 错误指标</h3>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-value">{stats.totalErrors}</div>
              <div className="metric-label">总错误数</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{stats.uniqueErrors}</div>
              <div className="metric-label">唯一错误</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{metrics.errorRate.toFixed(2)}</div>
              <div className="metric-label">错误率 (/s)</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">
                {metrics.lastErrorTime ? formatTimestamp(metrics.lastErrorTime) : '无'}
              </div>
              <div className="metric-label">最后错误</div>
            </div>
          </div>
        </div>
      )}

      {/* 过滤器 */}
      <div className="filters-section">
        <h3>🔍 过滤器</h3>
        <div className="filters-row">
          <div className="filter-group">
            <label>时间窗口:</label>
            <select 
              value={timeWindow} 
              onChange={(e) => setTimeWindow(Number(e.target.value))}
            >
              <option value={5 * 60 * 1000}>5分钟</option>
              <option value={30 * 60 * 1000}>30分钟</option>
              <option value={60 * 60 * 1000}>1小时</option>
              <option value={6 * 60 * 60 * 1000}>6小时</option>
              <option value={24 * 60 * 60 * 1000}>24小时</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>类别:</label>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value as ErrorCategory | 'all')}
            >
              <option value="all">全部</option>
              {Object.values(ErrorCategory).map(category => (
                <option key={category} value={category}>
                  {getCategoryIcon(category)} {category}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label>严重程度:</label>
            <select 
              value={selectedSeverity} 
              onChange={(e) => setSelectedSeverity(e.target.value as ErrorSeverity | 'all')}
            >
              <option value="all">全部</option>
              {Object.values(ErrorSeverity).map(severity => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 错误列表 */}
      <div className="errors-section">
        <h3>📋 错误详情</h3>
        {errors.length === 0 ? (
          <div className="no-errors">
            ✅ 在选定时间窗口内没有发现错误
          </div>
        ) : (
          <div className="errors-list">
            {errors.slice(0, 20).map(error => (
              <div key={error.id} className="error-item">
                <div className="error-header">
                  <div className="error-meta">
                    <span className="error-category">
                      {getCategoryIcon(error.category)} {error.category}
                    </span>
                    <span 
                      className="error-severity"
                      style={{ color: getSeverityColor(error.severity) }}
                    >
                      {error.severity}
                    </span>
                    <span className="error-count">
                      {error.count > 1 ? `${error.count}次` : ''}
                    </span>
                  </div>
                  <div className="error-time">
                    {formatTimestamp(error.timestamp)}
                  </div>
                </div>
                
                <div className="error-message">
                  {error.message}
                </div>
                
                {error.context.url && (
                  <div className="error-context">
                    <span className="context-label">URL:</span>
                    <span className="context-value">{error.context.url}</span>
                  </div>
                )}
                
                {error.context.component && (
                  <div className="error-context">
                    <span className="context-label">组件:</span>
                    <span className="context-value">{error.context.component}</span>
                  </div>
                )}
                
                {error.stack && (
                  <details className="error-stack">
                    <summary>堆栈跟踪</summary>
                    <pre>{error.stack}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 导出功能 */}
      <div className="export-section">
        <h3>📤 导出数据</h3>
        <div className="export-buttons">
          <button 
            onClick={() => {
              const data = errorLogger.exportErrors('json')
              const blob = new Blob([data], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `errors-${new Date().toISOString().split('T')[0]}.json`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="export-btn"
          >
            📄 导出JSON
          </button>
          
          <button 
            onClick={() => {
              const data = errorLogger.exportErrors('csv')
              const blob = new Blob([data], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `errors-${new Date().toISOString().split('T')[0]}.csv`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="export-btn"
          >
            📊 导出CSV
          </button>
          
          <button 
            onClick={() => {
              const cleared = errorLogger.clearErrors({ 
                olderThanMs: 24 * 60 * 60 * 1000 // 清理24小时前的错误
              })
              alert(`已清理 ${cleared} 个旧错误`)
              refreshData()
            }}
            className="clear-btn"
          >
            🗑️ 清理旧错误
          </button>
        </div>
      </div>
    </div>
  )
}

export default ErrorDashboard