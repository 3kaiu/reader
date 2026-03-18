import { createLogger } from '../shared/logger.ts'
import type { EnhancedWorkerEnv } from './types.ts'

// ============================================
// Enhanced Analytics System (利用D1和Analytics Engine)
// ============================================
export class AnalyticsSystem {
  private env: EnhancedWorkerEnv
  private logger: any

  constructor(env: EnhancedWorkerEnv) {
    this.env = env
    this.logger = createLogger(env)
  }

  // 记录用户行为到D1数据库（schema: user_events）
  async recordUserAction(userId: string, eventType: string, properties: any): Promise<void> {
    try {
      const timestamp = new Date().toISOString()
      const props = properties || {}
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

      // 发送到Analytics Engine进行实时分析
      await this.env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: [userId, eventType],
        doubles: [1.0],
        indexes: ['user_actions']
      })
    } catch (error) {
      this.logger.error('Failed to record user action:', error)
    }
  }

  async getUserStats(userId: string): Promise<any> {
    try {
      const result = await this.env.ANALYTICS_DB.prepare(`
        SELECT
          COUNT(*) as total_events,
          COUNT(DISTINCT DATE(timestamp)) as active_days,
          MAX(timestamp) as last_activity
        FROM user_events
        WHERE user_id = ? AND timestamp > datetime('now', '-30 days')
      `).bind(userId).first()

      return result
    } catch (error) {
      this.logger.error('Failed to get user stats:', error)
      return null
    }
  }

  async recordPerformanceMetrics(metrics: any): Promise<void> {
    try {
      await this.env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: ['performance', metrics.endpoint || 'unknown'],
        doubles: [metrics.responseTime || 0, metrics.statusCode || 0],
        indexes: ['performance_metrics']
      })
    } catch (error) {
      this.logger.error('Failed to record performance metrics:', error)
    }
  }

  async getPopularContent(limit: number = 10): Promise<any[]> {
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
      `).bind(limit).all()

      return result.results || []
    } catch (error) {
      this.logger.error('Failed to get popular content:', error)
      return []
    }
  }
}

// ============================================
// Enhanced User Preferences System (利用D1)
// ============================================
export class UserPreferencesSystem {
  private env: EnhancedWorkerEnv
  private logger: any

  constructor(env: EnhancedWorkerEnv) {
    this.env = env
    this.logger = createLogger(env)
  }

  async savePreferences(userId: string, preferences: any): Promise<void> {
    try {
      await this.env.USER_PREFERENCES_DB.prepare(`
        INSERT OR REPLACE INTO user_preferences (user_id, preferences, updated_at)
        VALUES (?, ?, ?)
      `).bind(
        userId,
        JSON.stringify(preferences),
        new Date().toISOString()
      ).run()
    } catch (error) {
      this.logger.error('Failed to save user preferences:', error)
    }
  }

  async getPreferences(userId: string): Promise<any> {
    try {
      const result = await this.env.USER_PREFERENCES_DB.prepare(`
        SELECT preferences FROM user_preferences WHERE user_id = ?
      `).bind(userId).first()

      return result ? JSON.parse(result.preferences as string) : {}
    } catch (error) {
      this.logger.error('Failed to get user preferences:', error)
      return {}
    }
  }

  async backupPreferences(userId: string, keep: number = 5): Promise<void> {
    try {
      const preferences = await this.getPreferences(userId)
      const backupKey = `preferences/${userId}/${Date.now()}.json`

      await this.env.BACKUP_R2.put(backupKey, JSON.stringify({
        userId,
        preferences,
        timestamp: new Date().toISOString()
      }))

      const backups = await this.listUserBackups(userId)
      if (backups.length > keep) {
        for (const oldBackup of backups.slice(keep)) {
          await this.env.BACKUP_R2.delete(oldBackup.key)
        }
      }
    } catch (error) {
      this.logger.error('Failed to backup preferences:', error)
    }
  }

  private async listUserBackups(userId: string): Promise<any[]> {
    const backups: any[] = []
    const prefix = `preferences/${userId}/`
    for await (const obj of this.env.BACKUP_R2.list({ prefix })) {
      backups.push(obj)
    }
    return backups.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
  }
}

// ============================================
// Enhanced Content Management (利用R2)
// ============================================
export class ContentManagementSystem {
  private env: EnhancedWorkerEnv
  private logger: any

  constructor(env: EnhancedWorkerEnv) {
    this.env = env
    this.logger = createLogger(env)
  }

  async uploadUserContent(userId: string, fileName: string, content: ArrayBuffer | string): Promise<string> {
    const key = `usercontent/${userId}/${Date.now()}-${fileName}`
    await this.env.USER_CONTENT_R2.put(key, content, {
      httpMetadata: {
        contentType: this.getContentType(fileName)
      }
    })
    return key
  }

  async getUserContent(key: string): Promise<any | null> {
    try {
      return await this.env.USER_CONTENT_R2.get(key)
    } catch (error) {
      this.logger.error('Failed to get user content:', error)
      return null
    }
  }

  async deleteUserContent(key: string): Promise<void> {
    try {
      await this.env.USER_CONTENT_R2.delete(key)
    } catch (error) {
      this.logger.error('Failed to delete user content:', error)
    }
  }

  async createUserBackup(userId: string): Promise<string> {
    const backupData = {
      userId,
      timestamp: new Date().toISOString(),
      data: {}
    }
    const backupKey = `backups/${userId}/${Date.now()}.json`
    await this.env.BACKUP_R2.put(backupKey, JSON.stringify(backupData))
    return backupKey
  }

  private getContentType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase()
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      json: 'application/json',
      txt: 'text/plain',
      pdf: 'application/pdf',
    }
    return contentTypes[ext || ''] || 'application/octet-stream'
  }
}

// ============================================
// Enhanced Queue Processing (利用Queues)
// ============================================
export class QueueProcessor {
  private env: EnhancedWorkerEnv
  private logger: any

  constructor(env: EnhancedWorkerEnv) {
    this.env = env
    this.logger = createLogger(env)
  }

  async queueAnalyticsEvent(eventType: string, data: any): Promise<void> {
    try {
      await this.env.ANALYTICS_QUEUE.send({
        type: 'analytics_event',
        eventType,
        data,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      this.logger.error('Failed to queue analytics event:', error)
    }
  }

  async processQueueMessage(message: any): Promise<void> {
    try {
      switch (message.type) {
        case 'analytics_event':
          this.logger.info('Processing analytics event:', message.eventType)
          break
        case 'backup_request':
          this.logger.info('Processing backup request for user:', message.userId)
          break
        default:
          this.logger.warn('Unknown queue message type:', message.type)
      }
    } catch (error) {
      this.logger.error('Failed to process queue message:', error)
    }
  }
}

