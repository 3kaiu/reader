/**
 * 🏥 Health Dashboard - 系统健康监控仪表板
 * 可视化展示系统健康状态、组件状态、告警信息和历史趋势
 */

import React, { useState, useMemo } from 'react'
import { 
  useHealthMonitor, 
  getHealthStatusColor, 
  getHealthStatusIcon, 
  formatUptime, 
  formatHealthScore 
} from '../hooks/useHealthMonitor'
import { SystemHealthStatus, HealthAlert } from '../utils/healthMonitor'

interface HealthDashboardProps {
  className?: string
  showHistory?: boolean
  showAlerts?: boolean
  showComponents?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

export const HealthDashboard: React.FC<HealthDashboardProps> = ({
  className = '',
  showHistory = true,
  showAlerts = true,
  showComponents = true,
  autoRefresh = true,
  refreshInterval = 60000
}) => {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'components' | 'alerts' | 'history'>('overview')
  
  const {
    currentHealth,
    healthHistory,
    activeAlerts,
    isLoading,
    error,
    refreshHealth,
    triggerCheck,
    resolveAlert,
    getComponentHealth,
    systemStats,
    healthTrend
  } = useHealthMonitor({
    autoRefresh,
    refreshInterval,
    enableNotifications: true
  })

  // 计算统计数据
  const stats = useMemo(() => {
    if (!currentHealth || !systemStats) return null

    const criticalComponents = currentHealth.components.filter(c => c.status === 'critical').length
    const warningComponents = currentHealth.components.filter(c => c.status === 'warning').length
    const healthyComponents = currentHealth.components.filter(c => c.status === 'healthy').length

    return {
      totalComponents: currentHealth.components.length,
      healthyComponents,
      warningComponents,
      criticalComponents,
      uptime: systemStats.uptime,
      totalChecks: systemStats.totalChecks,
      activeAlerts: activeAlerts.filter(a => !a.resolved).length
    }
  }, [currentHealth, systemStats, activeAlerts])

  // 渲染加载状态
  if (isLoading && !currentHealth) {
    return (
      <div className={`health-dashboard loading ${className}`}>
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading health status...</p>
        </div>
      </div>
    )
  }

  // 渲染错误状态
  if (error && !currentHealth) {
    return (
      <div className={`health-dashboard error ${className}`}>
        <div className="error-message">
          <h3>❌ Health Check Failed</h3>
          <p>{error}</p>
          <button onClick={refreshHealth} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!currentHealth) {
    return (
      <div className={`health-dashboard empty ${className}`}>
        <p>No health data available</p>
      </div>
    )
  }

  return (
    <div className={`health-dashboard ${className}`}>
      {/* 头部状态概览 */}
      <div className="health-header">
        <div className="health-status">
          <div 
            className="status-indicator"
            style={{ backgroundColor: getHealthStatusColor(currentHealth.overall) }}
          >
            {getHealthStatusIcon(currentHealth.overall)}
          </div>
          <div className="status-info">
            <h2>System Health</h2>
            <p className="status-text">
              {currentHealth.overall.toUpperCase()} - {formatHealthScore(currentHealth.score)}
            </p>
            <p className="last-check">
              Last check: {new Date(currentHealth.lastCheck).toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="health-actions">
          <button 
            onClick={triggerCheck} 
            disabled={isLoading}
            className="check-button"
          >
            {isLoading ? '🔄' : '🔍'} Check Now
          </button>
          <button 
            onClick={refreshHealth}
            className="refresh-button"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* 快速统计 */}
      {stats && (
        <div className="health-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.totalComponents}</div>
            <div className="stat-label">Components</div>
          </div>
          <div className="stat-card healthy">
            <div className="stat-value">{stats.healthyComponents}</div>
            <div className="stat-label">Healthy</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-value">{stats.warningComponents}</div>
            <div className="stat-label">Warning</div>
          </div>
          <div className="stat-card critical">
            <div className="stat-value">{stats.criticalComponents}</div>
            <div className="stat-label">Critical</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatUptime(stats.uptime)}</div>
            <div className="stat-label">Uptime</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.activeAlerts}</div>
            <div className="stat-label">Active Alerts</div>
          </div>
        </div>
      )}

      {/* 资源使用情况 */}
      <div className="resource-usage">
        <h3>Resource Usage</h3>
        <div className="resource-bars">
          <div className="resource-bar">
            <label>Memory</label>
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ 
                  width: `${Math.min(currentHealth.resourceUsage.memory / 200 * 100, 100)}%`,
                  backgroundColor: currentHealth.resourceUsage.memory > 150 ? '#EF4444' : '#10B981'
                }}
              ></div>
            </div>
            <span>{currentHealth.resourceUsage.memory.toFixed(0)}MB</span>
          </div>
          
          <div className="resource-bar">
            <label>Storage</label>
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ 
                  width: `${currentHealth.resourceUsage.storage}%`,
                  backgroundColor: currentHealth.resourceUsage.storage > 80 ? '#EF4444' : '#10B981'
                }}
              ></div>
            </div>
            <span>{currentHealth.resourceUsage.storage.toFixed(1)}%</span>
          </div>
          
          <div className="resource-bar">
            <label>Network</label>
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ 
                  width: `${currentHealth.resourceUsage.network}%`,
                  backgroundColor: currentHealth.resourceUsage.network > 70 ? '#F59E0B' : '#10B981'
                }}
              ></div>
            </div>
            <span>{currentHealth.resourceUsage.network.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* 标签导航 */}
      <div className="health-tabs">
        <button 
          className={selectedTab === 'overview' ? 'active' : ''}
          onClick={() => setSelectedTab('overview')}
        >
          Overview
        </button>
        {showComponents && (
          <button 
            className={selectedTab === 'components' ? 'active' : ''}
            onClick={() => setSelectedTab('components')}
          >
            Components ({currentHealth.components.length})
          </button>
        )}
        {showAlerts && (
          <button 
            className={selectedTab === 'alerts' ? 'active' : ''}
            onClick={() => setSelectedTab('alerts')}
          >
            Alerts ({activeAlerts.filter(a => !a.resolved).length})
          </button>
        )}
        {showHistory && (
          <button 
            className={selectedTab === 'history' ? 'active' : ''}
            onClick={() => setSelectedTab('history')}
          >
            History
          </button>
        )}
      </div>

      {/* 标签内容 */}
      <div className="health-content">
        {selectedTab === 'overview' && (
          <OverviewTab 
            health={currentHealth} 
            trend={healthTrend}
            stats={systemStats}
          />
        )}
        
        {selectedTab === 'components' && showComponents && (
          <ComponentsTab 
            components={currentHealth.components}
            getComponentHealth={getComponentHealth}
          />
        )}
        
        {selectedTab === 'alerts' && showAlerts && (
          <AlertsTab 
            alerts={activeAlerts}
            onResolveAlert={resolveAlert}
          />
        )}
        
        {selectedTab === 'history' && showHistory && (
          <HistoryTab 
            history={healthHistory}
            trend={healthTrend}
          />
        )}
      </div>
    </div>
  )
}

// 概览标签
const OverviewTab: React.FC<{
  health: SystemHealthStatus
  trend: string
  stats: any
}> = ({ health, trend, stats }) => (
  <div className="overview-tab">
    <div className="overview-grid">
      <div className="overview-card">
        <h4>Health Trend</h4>
        <div className={`trend-indicator ${trend}`}>
          {trend === 'improving' && '📈 Improving'}
          {trend === 'stable' && '➡️ Stable'}
          {trend === 'degrading' && '📉 Degrading'}
          {trend === 'unknown' && '❓ Unknown'}
        </div>
      </div>
      
      <div className="overview-card">
        <h4>System Info</h4>
        <ul>
          <li>Monitoring: {stats?.isRunning ? '✅ Active' : '❌ Inactive'}</li>
          <li>Total Checks: {stats?.totalChecks || 0}</li>
          <li>Check Interval: {stats?.config?.checkInterval / 1000}s</li>
          <li>Auto Recovery: {stats?.config?.enableAutoRecovery ? '✅' : '❌'}</li>
        </ul>
      </div>
    </div>
    
    <div className="recent-issues">
      <h4>Recent Issues</h4>
      {health.components.filter(c => c.status !== 'healthy').length === 0 ? (
        <p className="no-issues">✅ No issues detected</p>
      ) : (
        <ul>
          {health.components
            .filter(c => c.status !== 'healthy')
            .map(component => (
              <li key={component.component} className={`issue ${component.status}`}>
                <span className="component-name">{component.component}</span>
                <span className="issue-message">{component.message}</span>
                <span className="issue-time">
                  {new Date(component.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  </div>
)

// 组件标签
const ComponentsTab: React.FC<{
  components: SystemHealthStatus['components']
  getComponentHealth: (name: string) => any
}> = ({ components }) => (
  <div className="components-tab">
    <div className="components-grid">
      {components.map(component => (
        <div key={component.component} className={`component-card ${component.status}`}>
          <div className="component-header">
            <h4>{component.component}</h4>
            <div className="component-status">
              {getHealthStatusIcon(component.status as any)}
              <span>{component.status}</span>
            </div>
          </div>
          
          <div className="component-details">
            <p className="component-message">{component.message}</p>
            {component.responseTime && (
              <p className="response-time">
                Response: {component.responseTime}ms
              </p>
            )}
            <p className="last-check">
              Last check: {new Date(component.timestamp).toLocaleString()}
            </p>
          </div>
          
          {component.details && (
            <details className="component-raw-details">
              <summary>Raw Details</summary>
              <pre>{JSON.stringify(component.details, null, 2)}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  </div>
)

// 告警标签
const AlertsTab: React.FC<{
  alerts: HealthAlert[]
  onResolveAlert: (id: string) => void
}> = ({ alerts, onResolveAlert }) => {
  const activeAlerts = alerts.filter(a => !a.resolved)
  const resolvedAlerts = alerts.filter(a => a.resolved)

  return (
    <div className="alerts-tab">
      <div className="alerts-section">
        <h4>Active Alerts ({activeAlerts.length})</h4>
        {activeAlerts.length === 0 ? (
          <p className="no-alerts">✅ No active alerts</p>
        ) : (
          <div className="alerts-list">
            {activeAlerts.map(alert => (
              <div key={alert.id} className={`alert-card ${alert.severity}`}>
                <div className="alert-header">
                  <div className="alert-info">
                    <span className="alert-component">{alert.component}</span>
                    <span className="alert-severity">{alert.severity}</span>
                  </div>
                  <button 
                    onClick={() => onResolveAlert(alert.id)}
                    className="resolve-button"
                  >
                    ✅ Resolve
                  </button>
                </div>
                <p className="alert-message">{alert.message}</p>
                <p className="alert-time">
                  {new Date(alert.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {resolvedAlerts.length > 0 && (
        <div className="alerts-section">
          <h4>Resolved Alerts ({resolvedAlerts.length})</h4>
          <div className="alerts-list">
            {resolvedAlerts.slice(0, 5).map(alert => (
              <div key={alert.id} className="alert-card resolved">
                <div className="alert-info">
                  <span className="alert-component">{alert.component}</span>
                  <span className="alert-severity">{alert.severity}</span>
                </div>
                <p className="alert-message">{alert.message}</p>
                <p className="alert-time">
                  Resolved: {alert.resolvedAt ? new Date(alert.resolvedAt).toLocaleString() : 'Unknown'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// 历史标签
const HistoryTab: React.FC<{
  history: SystemHealthStatus[]
  trend: string
}> = ({ history, trend }) => {
  const chartData = useMemo(() => {
    return history.slice(-24).map((status, index) => ({
      time: new Date(status.lastCheck).toLocaleTimeString(),
      score: status.score,
      status: status.overall
    }))
  }, [history])

  return (
    <div className="history-tab">
      <div className="history-summary">
        <h4>Health Trend: {trend}</h4>
        <p>Showing last {Math.min(history.length, 24)} checks</p>
      </div>

      {/* 简单的图表显示 */}
      <div className="health-chart">
        <div className="chart-container">
          {chartData.map((point, index) => (
            <div 
              key={index}
              className="chart-point"
              style={{
                left: `${(index / (chartData.length - 1)) * 100}%`,
                bottom: `${point.score}%`,
                backgroundColor: getHealthStatusColor(point.status as any)
              }}
              title={`${point.time}: ${point.score}% (${point.status})`}
            />
          ))}
        </div>
        <div className="chart-labels">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* 历史记录列表 */}
      <div className="history-list">
        <h4>Recent Checks</h4>
        {history.slice(-10).reverse().map((status, index) => (
          <div key={status.lastCheck} className={`history-item ${status.overall}`}>
            <div className="history-time">
              {new Date(status.lastCheck).toLocaleString()}
            </div>
            <div className="history-status">
              {getHealthStatusIcon(status.overall)} {status.overall}
            </div>
            <div className="history-score">
              {formatHealthScore(status.score)}
            </div>
            <div className="history-issues">
              {status.components.filter(c => c.status !== 'healthy').length} issues
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default HealthDashboard