/**
 * Analytics Dashboard Component
 * Displays analytics metrics and performance data
 * Validates Requirement 7.1: Analytics tracking visualization
 */

import React, { useState, useEffect } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import './AnalyticsDashboard.css';

interface AnalyticsMetrics {
  pageViews: number;
  uniqueUsers: number;
  sessionDuration: number;
  bounceRate: number;
  performanceScore: number;
  errorRate: number;
  cacheHitRate: number;
  resourceUsage: {
    memory: number;
    storage: number;
    bandwidth: number;
  };
  topPages: Array<{ page: string; views: number }>;
  userInteractions: Array<{ action: string; count: number }>;
}

interface ResourceLimits {
  kvReads: { used: number; limit: number };
  kvWrites: { used: number; limit: number };
  workerRequests: { used: number; limit: number };
  cdnBandwidth: { used: number; limit: string };
  imageTransformations: { used: number; limit: number };
  aiRequests: { used: number; limit: number };
}

export const AnalyticsDashboard: React.FC = () => {
  const { trackEvent, trackPageView } = useAnalytics();
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [resourceLimits, setResourceLimits] = useState<ResourceLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    trackPageView('/analytics-dashboard');
    loadAnalyticsData();
  }, [timeRange, trackPageView]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch analytics metrics
      const metricsResponse = await fetch(`/api/analytics/metrics?range=${timeRange}`);
      if (!metricsResponse.ok) {
        throw new Error('Failed to load analytics metrics');
      }
      const metricsData = await metricsResponse.json();
      setMetrics(metricsData);

      // Fetch resource usage
      const limitsResponse = await fetch('/api/analytics/limits');
      if (!limitsResponse.ok) {
        throw new Error('Failed to load resource limits');
      }
      const limitsData = await limitsResponse.json();
      setResourceLimits(limitsData);

      trackEvent('analytics_dashboard_loaded', {
        timeRange,
        metricsLoaded: !!metricsData,
        limitsLoaded: !!limitsData,
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      trackEvent('analytics_dashboard_error', {
        error: err instanceof Error ? err.message : 'Unknown error',
        timeRange,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const formatBytes = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getUsageColor = (used: number, limit: number): string => {
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return 'danger';
    if (percentage >= 70) return 'warning';
    return 'success';
  };

  const getPerformanceRating = (score: number): string => {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  };

  if (loading) {
    return (
      <div className="analytics-dashboard loading">
        <div className="loading-spinner"></div>
        <p>Loading analytics data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-dashboard error">
        <div className="error-message">
          <h3>Error Loading Analytics</h3>
          <p>{error}</p>
          <button onClick={loadAnalyticsData} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!metrics || !resourceLimits) {
    return (
      <div className="analytics-dashboard no-data">
        <p>No analytics data available</p>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <header className="dashboard-header">
        <h1>Analytics Dashboard</h1>
        <div className="time-range-selector">
          {(['1h', '24h', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              className={`time-range-button ${timeRange === range ? 'active' : ''}`}
              onClick={() => setTimeRange(range)}
            >
              {range}
            </button>
          ))}
        </div>
      </header>

      <div className="dashboard-grid">
        {/* Key Metrics */}
        <section className="metrics-section">
          <h2>Key Metrics</h2>
          <div className="metrics-grid">
            <div className="metric-card">
              <h3>Page Views</h3>
              <div className="metric-value">{formatNumber(metrics.pageViews)}</div>
            </div>
            <div className="metric-card">
              <h3>Unique Users</h3>
              <div className="metric-value">{formatNumber(metrics.uniqueUsers)}</div>
            </div>
            <div className="metric-card">
              <h3>Avg Session</h3>
              <div className="metric-value">{Math.round(metrics.sessionDuration / 60)}m</div>
            </div>
            <div className="metric-card">
              <h3>Bounce Rate</h3>
              <div className="metric-value">{metrics.bounceRate.toFixed(1)}%</div>
            </div>
          </div>
        </section>

        {/* Performance Metrics */}
        <section className="performance-section">
          <h2>Performance</h2>
          <div className="performance-grid">
            <div className="performance-card">
              <h3>Performance Score</h3>
              <div className={`performance-score ${getPerformanceRating(metrics.performanceScore)}`}>
                {metrics.performanceScore.toFixed(0)}
              </div>
            </div>
            <div className="performance-card">
              <h3>Error Rate</h3>
              <div className="performance-value">{(metrics.errorRate * 100).toFixed(2)}%</div>
            </div>
            <div className="performance-card">
              <h3>Cache Hit Rate</h3>
              <div className="performance-value">{metrics.cacheHitRate.toFixed(1)}%</div>
            </div>
          </div>
        </section>

        {/* Resource Usage */}
        <section className="resource-section">
          <h2>Resource Usage</h2>
          <div className="resource-grid">
            <div className="resource-card">
              <h3>Memory Usage</h3>
              <div className="resource-value">{formatBytes(metrics.resourceUsage.memory)}</div>
            </div>
            <div className="resource-card">
              <h3>Storage Usage</h3>
              <div className="resource-value">{formatBytes(metrics.resourceUsage.storage)}</div>
            </div>
            <div className="resource-card">
              <h3>Bandwidth</h3>
              <div className="resource-value">{formatBytes(metrics.resourceUsage.bandwidth)}</div>
            </div>
          </div>
        </section>

        {/* Free Tier Limits */}
        <section className="limits-section">
          <h2>Free Tier Usage</h2>
          <div className="limits-grid">
            <div className="limit-card">
              <h3>KV Reads</h3>
              <div className="limit-bar">
                <div 
                  className={`limit-fill ${getUsageColor(resourceLimits.kvReads.used, resourceLimits.kvReads.limit)}`}
                  style={{ width: `${(resourceLimits.kvReads.used / resourceLimits.kvReads.limit) * 100}%` }}
                ></div>
              </div>
              <div className="limit-text">
                {formatNumber(resourceLimits.kvReads.used)} / {formatNumber(resourceLimits.kvReads.limit)}
              </div>
            </div>

            <div className="limit-card">
              <h3>KV Writes</h3>
              <div className="limit-bar">
                <div 
                  className={`limit-fill ${getUsageColor(resourceLimits.kvWrites.used, resourceLimits.kvWrites.limit)}`}
                  style={{ width: `${(resourceLimits.kvWrites.used / resourceLimits.kvWrites.limit) * 100}%` }}
                ></div>
              </div>
              <div className="limit-text">
                {formatNumber(resourceLimits.kvWrites.used)} / {formatNumber(resourceLimits.kvWrites.limit)}
              </div>
            </div>

            <div className="limit-card">
              <h3>Worker Requests</h3>
              <div className="limit-bar">
                <div 
                  className={`limit-fill ${getUsageColor(resourceLimits.workerRequests.used, resourceLimits.workerRequests.limit)}`}
                  style={{ width: `${(resourceLimits.workerRequests.used / resourceLimits.workerRequests.limit) * 100}%` }}
                ></div>
              </div>
              <div className="limit-text">
                {formatNumber(resourceLimits.workerRequests.used)} / {formatNumber(resourceLimits.workerRequests.limit)}
              </div>
            </div>

            <div className="limit-card">
              <h3>AI Requests</h3>
              <div className="limit-bar">
                <div 
                  className={`limit-fill ${getUsageColor(resourceLimits.aiRequests.used, resourceLimits.aiRequests.limit)}`}
                  style={{ width: `${(resourceLimits.aiRequests.used / resourceLimits.aiRequests.limit) * 100}%` }}
                ></div>
              </div>
              <div className="limit-text">
                {formatNumber(resourceLimits.aiRequests.used)} / {formatNumber(resourceLimits.aiRequests.limit)}
              </div>
            </div>
          </div>
        </section>

        {/* Top Pages */}
        <section className="pages-section">
          <h2>Top Pages</h2>
          <div className="pages-list">
            {metrics.topPages.map((page, index) => (
              <div key={page.page} className="page-item">
                <span className="page-rank">{index + 1}</span>
                <span className="page-path">{page.page}</span>
                <span className="page-views">{formatNumber(page.views)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* User Interactions */}
        <section className="interactions-section">
          <h2>User Interactions</h2>
          <div className="interactions-list">
            {metrics.userInteractions.map((interaction) => (
              <div key={interaction.action} className="interaction-item">
                <span className="interaction-action">{interaction.action}</span>
                <span className="interaction-count">{formatNumber(interaction.count)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};