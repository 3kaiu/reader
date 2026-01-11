/**
 * KV Storage Management Dashboard
 * 
 * Provides a comprehensive interface for monitoring and managing KV storage
 */

import React, { useState, useEffect } from 'react';
import useKVStorageManager from '../hooks/useKVStorageManager';
import './KVStorageDashboard.css';

interface KVStorageDashboardProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const KVStorageDashboard: React.FC<KVStorageDashboardProps> = ({
  className = '',
  autoRefresh = true,
  refreshInterval = 60000
}) => {
  const {
    usage,
    metrics,
    isLoading,
    error,
    lastCleanup,
    isStorageHealthy,
    isStorageCritical,
    storagePercentage,
    performCleanup,
    checkStorageHealth,
    optimizeStorage,
    refreshData,
    clearError
  } = useKVStorageManager({}, { autoRefresh, refreshInterval });

  const [healthStatus, setHealthStatus] = useState<{
    status: 'healthy' | 'warning' | 'critical';
    message: string;
    recommendations: string[];
  } | null>(null);

  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>('');

  // Check storage health on mount and when usage changes
  useEffect(() => {
    const checkHealth = async () => {
      const health = await checkStorageHealth();
      if (health) {
        setHealthStatus(health);
      }
    };

    if (usage) {
      checkHealth();
    }
  }, [usage, checkStorageHealth]);

  const handleCleanup = async () => {
    setIsPerformingAction(true);
    setActionMessage('Performing cleanup...');
    
    try {
      const result = await performCleanup();
      if (result) {
        setActionMessage(
          `Cleanup completed: ${result.keysRemoved} keys removed, ` +
          `${formatBytes(result.sizeFreed)} freed in ${result.duration}ms`
        );
      }
    } catch (error) {
      setActionMessage('Cleanup failed');
    } finally {
      setIsPerformingAction(false);
      setTimeout(() => setActionMessage(''), 5000);
    }
  };

  const handleOptimize = async () => {
    setIsPerformingAction(true);
    setActionMessage('Optimizing storage...');
    
    try {
      const result = await optimizeStorage();
      if (result) {
        setActionMessage(
          `Optimization completed: ${result.keysCompressed} keys compressed, ` +
          `${formatBytes(result.spaceSaved)} saved`
        );
      }
    } catch (error) {
      setActionMessage('Optimization failed');
    } finally {
      setIsPerformingAction(false);
      setTimeout(() => setActionMessage(''), 5000);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'critical': return '#ef4444';
      default: return '#6b7280';
    }
  };

  if (isLoading && !usage) {
    return (
      <div className={`kv-storage-dashboard loading ${className}`}>
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading storage data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`kv-storage-dashboard ${className}`}>
      <div className="dashboard-header">
        <h2>KV Storage Management</h2>
        <div className="header-actions">
          <button 
            onClick={refreshData} 
            className="btn btn-secondary"
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
          <button onClick={clearError} className="error-close">×</button>
        </div>
      )}

      {actionMessage && (
        <div className="action-message">
          <span className="action-icon">ℹ️</span>
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Storage Usage Overview */}
      <div className="storage-overview">
        <div className="usage-card">
          <h3>Storage Usage</h3>
          <div className="usage-visual">
            <div className="usage-bar">
              <div 
                className={`usage-fill ${isStorageCritical ? 'critical' : isStorageHealthy ? 'healthy' : 'warning'}`}
                style={{ width: `${storagePercentage}%` }}
              ></div>
            </div>
            <div className="usage-text">
              {storagePercentage}% used
            </div>
          </div>
          {usage && (
            <div className="usage-details">
              <div className="detail-row">
                <span>Used:</span>
                <span>{formatBytes(usage.usedSize)}</span>
              </div>
              <div className="detail-row">
                <span>Available:</span>
                <span>{formatBytes(usage.availableSize)}</span>
              </div>
              <div className="detail-row">
                <span>Total:</span>
                <span>{formatBytes(usage.totalSize)}</span>
              </div>
              <div className="detail-row">
                <span>Keys:</span>
                <span>{usage.keyCount.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {healthStatus && (
          <div className="health-card">
            <h3>Storage Health</h3>
            <div className="health-status">
              <div 
                className="status-indicator"
                style={{ backgroundColor: getStatusColor(healthStatus.status) }}
              ></div>
              <span className="status-text">{healthStatus.message}</span>
            </div>
            {healthStatus.recommendations.length > 0 && (
              <div className="recommendations">
                <h4>Recommendations:</h4>
                <ul>
                  {healthStatus.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button 
          onClick={handleCleanup}
          className="btn btn-primary"
          disabled={isPerformingAction}
        >
          {isPerformingAction ? 'Cleaning...' : 'Perform Cleanup'}
        </button>
        <button 
          onClick={handleOptimize}
          className="btn btn-secondary"
          disabled={isPerformingAction}
        >
          {isPerformingAction ? 'Optimizing...' : 'Optimize Storage'}
        </button>
      </div>

      {/* Top Keys by Size */}
      {metrics?.topKeys && metrics.topKeys.length > 0 && (
        <div className="top-keys-section">
          <h3>Largest Keys</h3>
          <div className="keys-table">
            <div className="table-header">
              <span>Key</span>
              <span>Size</span>
              <span>Last Accessed</span>
            </div>
            {metrics.topKeys.map((key, index) => (
              <div key={index} className="table-row">
                <span className="key-name" title={key.key}>
                  {key.key.length > 40 ? `${key.key.substring(0, 40)}...` : key.key}
                </span>
                <span className="key-size">{formatBytes(key.size)}</span>
                <span className="key-accessed">{formatDate(key.lastAccessed)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retention Policy Status */}
      {metrics?.retentionStatus && metrics.retentionStatus.length > 0 && (
        <div className="retention-section">
          <h3>Retention Policy Status</h3>
          <div className="retention-grid">
            {metrics.retentionStatus.map((policy, index) => (
              <div key={index} className="retention-card">
                <div className="policy-pattern">{policy.pattern}</div>
                <div className="policy-stats">
                  <div className="stat">
                    <span className="stat-label">Keys Affected:</span>
                    <span className="stat-value">{policy.keysAffected}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Size to Free:</span>
                    <span className="stat-value">{formatBytes(policy.sizeFreed)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cleanup History */}
      {metrics?.cleanupHistory && metrics.cleanupHistory.length > 0 && (
        <div className="cleanup-history-section">
          <h3>Recent Cleanup History</h3>
          <div className="history-table">
            <div className="table-header">
              <span>Date</span>
              <span>Keys Removed</span>
              <span>Size Freed</span>
            </div>
            {metrics.cleanupHistory.slice(-10).reverse().map((cleanup, index) => (
              <div key={index} className="table-row">
                <span>{formatDate(cleanup.timestamp)}</span>
                <span>{cleanup.keysRemoved}</span>
                <span>{formatBytes(cleanup.sizeFreed)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Cleanup Info */}
      {lastCleanup && (
        <div className="last-cleanup-section">
          <h3>Last Cleanup Result</h3>
          <div className="cleanup-result">
            <div className="result-stat">
              <span className="stat-label">Keys Removed:</span>
              <span className="stat-value">{lastCleanup.keysRemoved}</span>
            </div>
            <div className="result-stat">
              <span className="stat-label">Size Freed:</span>
              <span className="stat-value">{formatBytes(lastCleanup.sizeFreed)}</span>
            </div>
            <div className="result-stat">
              <span className="stat-label">Duration:</span>
              <span className="stat-value">{lastCleanup.duration}ms</span>
            </div>
            {lastCleanup.errors.length > 0 && (
              <div className="cleanup-errors">
                <h4>Errors:</h4>
                <ul>
                  {lastCleanup.errors.map((error, index) => (
                    <li key={index} className="error-item">{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default KVStorageDashboard;