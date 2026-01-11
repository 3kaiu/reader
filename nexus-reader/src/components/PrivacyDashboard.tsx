/**
 * 🔒 Privacy Compliance Dashboard
 * Visual interface for monitoring privacy-compliant logging and data protection
 * **Feature: free-tier-maximization, Property 25: Privacy-Compliant Logging**
 */

import React, { useState, useEffect } from 'react'
import { usePrivacyLogger, usePrivacyCompliance } from '../hooks/usePrivacyLogger'
import { LogLevel, LogCategory, PrivacyLevel } from '../utils/privacyLogger'
import './PrivacyDashboard.css'

// Dashboard tab types
type DashboardTab = 'overview' | 'logs' | 'compliance' | 'settings'

// Log filter interface
interface LogFilters {
  level?: LogLevel
  category?: LogCategory
  privacy?: PrivacyLevel
  startTime?: number
  endTime?: number
  limit: number
}

export const PrivacyDashboard: React.FC = () => {
  const privacyLogger = usePrivacyLogger({
    autoLogPageViews: true,
    autoLogUserActions: true,
    autoLogErrors: true
  })
  
  const privacyCompliance = usePrivacyCompliance()
  
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [logs, setLogs] = useState(privacyLogger.getLogs({ limit: 100 }))
  const [filters, setFilters] = useState<LogFilters>({ limit: 100 })
  const [complianceStatus, setComplianceStatus] = useState(privacyCompliance.getComplianceStatus())
  const [auditResults, setAuditResults] = useState<any>(null)
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json')

  // Refresh data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setLogs(privacyLogger.getLogs(filters))
      setComplianceStatus(privacyCompliance.getComplianceStatus())
    }, 5000)

    return () => clearInterval(interval)
  }, [filters, privacyLogger, privacyCompliance])

  // Handle filter changes
  const handleFilterChange = (newFilters: Partial<LogFilters>) => {
    const updatedFilters = { ...filters, ...newFilters }
    setFilters(updatedFilters)
    setLogs(privacyLogger.getLogs(updatedFilters))
  }

  // Handle log export
  const handleExport = async () => {
    try {
      const exportData = await privacyLogger.exportLogs(exportFormat, false)
      const blob = new Blob([exportData], { 
        type: exportFormat === 'json' ? 'application/json' : 'text/csv' 
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `privacy-logs-${Date.now()}.${exportFormat}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  // Handle compliance audit
  const handleAudit = async () => {
    const results = await privacyCompliance.auditLogs()
    setAuditResults(results)
  }

  // Handle log cleanup
  const handleCleanup = async () => {
    const clearedCount = await privacyLogger.clearExpiredLogs()
    alert(`Cleared ${clearedCount} expired logs`)
    setLogs(privacyLogger.getLogs(filters))
  }

  // Render overview tab
  const renderOverview = () => {
    const report = complianceStatus.report
    
    return (
      <div className="privacy-overview">
        <div className="compliance-status">
          <h3>Privacy Compliance Status</h3>
          <div className={`status-indicator ${complianceStatus.isCompliant ? 'compliant' : 'non-compliant'}`}>
            {complianceStatus.isCompliant ? '✅ Compliant' : '⚠️ Issues Found'}
          </div>
        </div>

        <div className="metrics-grid">
          <div className="metric-card">
            <h4>Total Logs</h4>
            <div className="metric-value">{report.totalLogs}</div>
          </div>
          
          <div className="metric-card">
            <h4>Retention Compliance</h4>
            <div className={`metric-value ${report.retentionCompliance ? 'good' : 'warning'}`}>
              {report.retentionCompliance ? 'Compliant' : 'Review Needed'}
            </div>
          </div>
          
          <div className="metric-card">
            <h4>Encryption Status</h4>
            <div className={`metric-value ${report.encryptionStatus ? 'good' : 'warning'}`}>
              {report.encryptionStatus ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          
          <div className="metric-card">
            <h4>Anonymization</h4>
            <div className={`metric-value ${report.anonymizationStatus ? 'good' : 'warning'}`}>
              {report.anonymizationStatus ? 'Active' : 'Inactive'}
            </div>
          </div>
        </div>

        <div className="privacy-breakdown">
          <h4>Logs by Privacy Level</h4>
          <div className="privacy-chart">
            {Object.entries(report.logsByPrivacyLevel).map(([level, count]) => (
              <div key={level} className="privacy-bar">
                <span className="privacy-label">{level}</span>
                <div className="privacy-bar-container">
                  <div 
                    className={`privacy-bar-fill privacy-${level}`}
                    style={{ width: `${(count / report.totalLogs) * 100}%` }}
                  />
                </div>
                <span className="privacy-count">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="category-breakdown">
          <h4>Logs by Category</h4>
          <div className="category-chart">
            {Object.entries(report.logsByCategory).map(([category, count]) => (
              <div key={category} className="category-item">
                <span className="category-label">{category}</span>
                <span className="category-count">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {complianceStatus.recommendations.length > 0 && (
          <div className="recommendations">
            <h4>Compliance Recommendations</h4>
            <ul>
              {complianceStatus.recommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // Render logs tab
  const renderLogs = () => (
    <div className="privacy-logs">
      <div className="logs-controls">
        <div className="filters">
          <select 
            value={filters.level || ''} 
            onChange={(e) => handleFilterChange({ level: e.target.value as LogLevel || undefined })}
          >
            <option value="">All Levels</option>
            {Object.values(LogLevel).map(level => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
          
          <select 
            value={filters.category || ''} 
            onChange={(e) => handleFilterChange({ category: e.target.value as LogCategory || undefined })}
          >
            <option value="">All Categories</option>
            {Object.values(LogCategory).map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          
          <select 
            value={filters.privacy || ''} 
            onChange={(e) => handleFilterChange({ privacy: e.target.value as PrivacyLevel || undefined })}
          >
            <option value="">All Privacy Levels</option>
            {Object.values(PrivacyLevel).map(privacy => (
              <option key={privacy} value={privacy}>{privacy}</option>
            ))}
          </select>
          
          <input
            type="number"
            placeholder="Limit"
            value={filters.limit}
            onChange={(e) => handleFilterChange({ limit: parseInt(e.target.value) || 100 })}
            min="1"
            max="1000"
          />
        </div>
        
        <div className="actions">
          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as 'json' | 'csv')}>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
          <button onClick={handleExport}>Export Logs</button>
          <button onClick={handleCleanup}>Clean Expired</button>
        </div>
      </div>

      <div className="logs-table">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Level</th>
              <th>Category</th>
              <th>Privacy</th>
              <th>Message</th>
              <th>Session</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className={`log-${log.level} privacy-${log.privacy}`}>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
                <td>
                  <span className={`level-badge level-${log.level}`}>
                    {log.level}
                  </span>
                </td>
                <td>{log.category}</td>
                <td>
                  <span className={`privacy-badge privacy-${log.privacy}`}>
                    {log.privacy}
                  </span>
                </td>
                <td className="log-message">{log.message}</td>
                <td className="session-id">{log.sessionId?.substring(0, 8)}...</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  // Render compliance tab
  const renderCompliance = () => (
    <div className="privacy-compliance">
      <div className="compliance-actions">
        <button onClick={handleAudit}>Run Privacy Audit</button>
      </div>

      {auditResults && (
        <div className="audit-results">
          <h4>Audit Results</h4>
          <div className={`audit-status ${auditResults.isCompliant ? 'compliant' : 'non-compliant'}`}>
            {auditResults.isCompliant ? '✅ No Issues Found' : '⚠️ Issues Detected'}
          </div>
          
          <div className="audit-summary">
            <p>Total logs audited: {auditResults.totalLogs}</p>
            <p>Issues found: {auditResults.issues.length}</p>
          </div>

          {auditResults.issues.length > 0 && (
            <div className="audit-issues">
              <h5>Issues:</h5>
              <ul>
                {auditResults.issues.map((issue: string, index: number) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="compliance-checklist">
        <h4>Privacy Compliance Checklist</h4>
        <div className="checklist-item">
          <input type="checkbox" checked={complianceStatus.report.retentionCompliance} readOnly />
          <label>Log retention within policy limits</label>
        </div>
        <div className="checklist-item">
          <input type="checkbox" checked={complianceStatus.report.encryptionStatus} readOnly />
          <label>Personal data logs encrypted</label>
        </div>
        <div className="checklist-item">
          <input type="checkbox" checked={complianceStatus.report.anonymizationStatus} readOnly />
          <label>User identifiers anonymized</label>
        </div>
        <div className="checklist-item">
          <input type="checkbox" checked={!auditResults || auditResults.isCompliant} readOnly />
          <label>No PII detected in logs</label>
        </div>
      </div>
    </div>
  )

  // Render settings tab
  const renderSettings = () => (
    <div className="privacy-settings">
      <h4>Privacy Settings</h4>
      <p>Privacy settings are configured at the application level.</p>
      <div className="settings-info">
        <h5>Current Configuration:</h5>
        <ul>
          <li>User ID Hashing: Enabled</li>
          <li>Device ID Hashing: Enabled</li>
          <li>IP Address Masking: Enabled</li>
          <li>Personal Data Removal: Enabled</li>
          <li>Personal Log Encryption: Enabled</li>
          <li>Retention Period: 30 days</li>
        </ul>
      </div>
    </div>
  )

  return (
    <div className="privacy-dashboard">
      <div className="dashboard-header">
        <h2>Privacy Compliance Dashboard</h2>
        <div className="session-info">
          Session: {privacyLogger.sessionId.substring(0, 12)}...
        </div>
      </div>

      <div className="dashboard-tabs">
        <button 
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'logs' ? 'active' : ''}
          onClick={() => setActiveTab('logs')}
        >
          Logs
        </button>
        <button 
          className={activeTab === 'compliance' ? 'active' : ''}
          onClick={() => setActiveTab('compliance')}
        >
          Compliance
        </button>
        <button 
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'logs' && renderLogs()}
        {activeTab === 'compliance' && renderCompliance()}
        {activeTab === 'settings' && renderSettings()}
      </div>
    </div>
  )
}

export default PrivacyDashboard