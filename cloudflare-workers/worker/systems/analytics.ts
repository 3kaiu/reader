import { createLogger, type Logger } from '../../shared/logger.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import type {
  PerformanceMetrics,
  PopularContentRow,
  UserActionProperties,
  UserStatsRow,
} from './types.ts'

export class AnalyticsSystem {
  private env: EnhancedWorkerEnv
  private logger: Logger

  constructor(env: EnhancedWorkerEnv) {
    this.env = env
    this.logger = createLogger(env)
  }

  async recordUserAction(
    userId: string,
    eventType: string,
    properties: UserActionProperties = {}
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString()
      const props = properties
      await this.env.ANALYTICS_DB.prepare(`
        INSERT INTO user_events (user_id, event_type, category, target_id, target_type, properties, timestamp, ip_address, user_agent, url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        eventType,
        props.category || null,
        props.targetId || props.bookId || null,
        props.targetType || (props.bookId ? 'book' : null),
        JSON.stringify(props),
        timestamp,
        props.ip || 'unknown',
        props.userAgent || null,
        props.url || null
      ).run()

      await this.env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: [userId, eventType],
        doubles: [1.0],
        indexes: ['user_actions'],
      })
    } catch (error) {
      this.logger.error('Failed to record user action:', error)
    }
  }

  async getUserStats(userId: string): Promise<UserStatsRow | null> {
    try {
      const result = await this.env.ANALYTICS_DB.prepare(`
        SELECT
          COUNT(*) as total_events,
          COUNT(DISTINCT DATE(timestamp)) as active_days,
          MAX(timestamp) as last_activity
        FROM user_events
        WHERE user_id = ? AND timestamp > datetime('now', '-30 days')
      `).bind(userId).first<UserStatsRow>()

      return result
    } catch (error) {
      this.logger.error('Failed to get user stats:', error)
      return null
    }
  }

  async recordPerformanceMetrics(metrics: PerformanceMetrics): Promise<void> {
    try {
      await this.env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: ['performance', metrics.endpoint || 'unknown'],
        doubles: [metrics.responseTime || 0, metrics.statusCode || 0],
        indexes: ['performance_metrics'],
      })
    } catch (error) {
      this.logger.error('Failed to record performance metrics:', error)
    }
  }

  async getPopularContent(limit = 10): Promise<PopularContentRow[]> {
    try {
      const result = await this.env.ANALYTICS_DB.prepare(`
        SELECT
          JSON_EXTRACT(properties, '$.bookId') as book_id,
          COUNT(*) as views
        FROM user_events
        WHERE event_type = 'view_book' AND timestamp > datetime('now', '-7 days')
        GROUP BY JSON_EXTRACT(properties, '$.bookId')
        ORDER BY views DESC
        LIMIT ?
      `).bind(limit).all<PopularContentRow>()

      return result.results || []
    } catch (error) {
      this.logger.error('Failed to get popular content:', error)
      return []
    }
  }
}
