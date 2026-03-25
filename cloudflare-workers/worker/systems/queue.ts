import { createLogger, type Logger } from '../../shared/logger.ts'
import type { JsonObject } from '../../shared/types.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import { isWorkerQueueMessage } from './shared.ts'

export class QueueProcessor {
  private env: EnhancedWorkerEnv
  private logger: Logger

  constructor(env: EnhancedWorkerEnv) {
    this.env = env
    this.logger = createLogger(env)
  }

  async queueAnalyticsEvent(eventType: string, data: JsonObject): Promise<void> {
    try {
      await this.env.ANALYTICS_QUEUE.send({
        type: 'analytics_event',
        eventType,
        data,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      this.logger.error('Failed to queue analytics event:', error)
    }
  }

  async queueBackupRequest(userId: string): Promise<void> {
    try {
      await this.env.ANALYTICS_QUEUE.send({
        type: 'backup_request',
        userId,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      this.logger.error('Failed to queue backup request:', error)
    }
  }

  async processQueueMessage(message: unknown): Promise<void> {
    try {
      if (!isWorkerQueueMessage(message)) {
        this.logger.warn('Unknown queue message payload:', message)
        return
      }

      switch (message.type) {
        case 'analytics_event':
          this.logger.info('Processing analytics event:', message.eventType)
          break
        case 'backup_request':
          this.logger.info('Processing backup request for user:', message.userId)
          break
      }
    } catch (error) {
      this.logger.error('Failed to process queue message:', error)
    }
  }
}
