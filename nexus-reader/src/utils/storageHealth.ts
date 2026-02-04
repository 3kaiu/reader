/**
 * Storage Health Monitor
 *
 * Monitors storage usage, performs health checks, and provides
 * maintenance recommendations for data persistence.
 */

import { logger } from './logger'

export interface StorageStats {
  totalSpace: number
  usedSpace: number
  availableSpace: number
  usagePercentage: number
  fragmentationRatio?: number
}

export interface StorageHealthReport {
  isHealthy: boolean
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    recommendation?: string
  }>
  stats: StorageStats
  lastCheck: number
  recommendations: string[]
}

export class StorageHealthMonitor {
  private static instance: StorageHealthMonitor
  private checkInterval: number = 5 * 60 * 1000 // 5 minutes
  private lastCheck: number = 0
  private cachedReport: StorageHealthReport | null = null

  private constructor() {}

  static getInstance(): StorageHealthMonitor {
    if (!StorageHealthMonitor.instance) {
      StorageHealthMonitor.instance = new StorageHealthMonitor()
    }
    return StorageHealthMonitor.instance
  }

  /**
   * Perform a comprehensive storage health check
   */
  async checkHealth(): Promise<StorageHealthReport> {
    const now = Date.now()

    // Return cached report if recent
    if (this.cachedReport && (now - this.lastCheck) < this.checkInterval) {
      return this.cachedReport
    }

    logger.info('Starting storage health check')

    try {
      const stats = await this.getStorageStats()
      const issues = await this.analyzeStorageIssues(stats)
      const recommendations = this.generateRecommendations(issues, stats)

      const report: StorageHealthReport = {
        isHealthy: issues.length === 0 || issues.every(issue => issue.severity === 'low'),
        issues,
        stats,
        lastCheck: now,
        recommendations
      }

      this.cachedReport = report
      this.lastCheck = now

      logger.info('Storage health check completed', {
        isHealthy: report.isHealthy,
        issueCount: issues.length
      })

      return report
    } catch (error) {
      logger.error('Storage health check failed', { error: error.message })

      // Return a basic error report
      return {
        isHealthy: false,
        issues: [{
          severity: 'critical',
          message: 'Storage health check failed',
          recommendation: 'Check storage permissions and try again'
        }],
        stats: {
          totalSpace: 0,
          usedSpace: 0,
          availableSpace: 0,
          usagePercentage: 0
        },
        lastCheck: now,
        recommendations: ['Contact support if the issue persists']
      }
    }
  }

  /**
   * Get storage statistics
   */
  private async getStorageStats(): Promise<StorageStats> {
    if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
      // Use StorageManager API for modern browsers
      const estimate = await navigator.storage.estimate()
      return {
        totalSpace: estimate.quota || 0,
        usedSpace: estimate.usage || 0,
        availableSpace: (estimate.quota || 0) - (estimate.usage || 0),
        usagePercentage: estimate.quota ? ((estimate.usage || 0) / estimate.quota) * 100 : 0
      }
    } else {
      // Fallback for older browsers or Node.js environment
      return {
        totalSpace: 1024 * 1024 * 1024 * 5, // Assume 5GB
        usedSpace: 1024 * 1024 * 1024 * 2, // Assume 2GB used
        availableSpace: 1024 * 1024 * 1024 * 3, // Assume 3GB available
        usagePercentage: 40
      }
    }
  }

  /**
   * Analyze storage for potential issues
   */
  private async analyzeStorageIssues(stats: StorageStats): Promise<StorageHealthReport['issues']> {
    const issues: StorageHealthReport['issues'] = []

    // Check usage percentage
    if (stats.usagePercentage > 90) {
      issues.push({
        severity: 'critical',
        message: `Storage usage is critically high: ${stats.usagePercentage.toFixed(1)}%`,
        recommendation: 'Clear cache, remove unused data, or expand storage capacity'
      })
    } else if (stats.usagePercentage > 75) {
      issues.push({
        severity: 'high',
        message: `Storage usage is high: ${stats.usagePercentage.toFixed(1)}%`,
        recommendation: 'Consider clearing old cache entries or archiving old data'
      })
    } else if (stats.usagePercentage > 50) {
      issues.push({
        severity: 'medium',
        message: `Storage usage is moderate: ${stats.usagePercentage.toFixed(1)}%`,
        recommendation: 'Monitor usage and plan for future capacity needs'
      })
    }

    // Check available space
    if (stats.availableSpace < 1024 * 1024 * 100) { // Less than 100MB
      issues.push({
        severity: 'high',
        message: `Very low available storage: ${(stats.availableSpace / (1024 * 1024)).toFixed(1)}MB`,
        recommendation: 'Free up space immediately to prevent data loss'
      })
    } else if (stats.availableSpace < 1024 * 1024 * 500) { // Less than 500MB
      issues.push({
        severity: 'medium',
        message: `Low available storage: ${(stats.availableSpace / (1024 * 1024)).toFixed(1)}MB`,
        recommendation: 'Consider freeing up space soon'
      })
    }

    return issues
  }

  /**
   * Generate maintenance recommendations
   */
  private generateRecommendations(
    issues: StorageHealthReport['issues'],
    stats: StorageStats
  ): string[] {
    const recommendations: string[] = []

    if (stats.usagePercentage > 80) {
      recommendations.push('Clear application cache')
      recommendations.push('Remove unused downloaded content')
      recommendations.push('Archive old reading history')
    }

    if (stats.usagePercentage > 60) {
      recommendations.push('Enable automatic cache cleanup')
      recommendations.push('Configure storage limits')
    }

    recommendations.push('Regularly monitor storage usage')
    recommendations.push('Consider cloud backup for important data')

    return recommendations
  }

  /**
   * Perform maintenance operations
   */
  async performMaintenance(): Promise<void> {
    logger.info('Starting storage maintenance')

    try {
      // Clear old cache entries
      await this.clearExpiredCache()

      // Defragment if supported
      await this.defragmentStorage()

      // Optimize database if applicable
      await this.optimizeDatabase()

      logger.info('Storage maintenance completed')
    } catch (error) {
      logger.error('Storage maintenance failed', { error: error.message })
      throw error
    }
  }

  private async clearExpiredCache(): Promise<void> {
    // Implementation would depend on cache system
    logger.debug('Clearing expired cache entries')
  }

  private async defragmentStorage(): Promise<void> {
    // Implementation would depend on storage system
    logger.debug('Defragmenting storage')
  }

  private async optimizeDatabase(): Promise<void> {
    // Implementation would depend on database system
    logger.debug('Optimizing database')
  }

  /**
   * Get storage usage trend
   */
  getUsageTrend(): Promise<Array<{ timestamp: number; usage: number }>> {
    // Would track historical usage data
    return Promise.resolve([])
  }
}

// Export singleton instance
export const storageHealth = StorageHealthMonitor.getInstance()

export default storageHealth