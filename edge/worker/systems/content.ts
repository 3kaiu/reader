import { createLogger, type Logger } from '../../shared/logger.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import { getContentType } from './shared.ts'

export class ContentManagementSystem {
  private env: EnhancedWorkerEnv
  private logger: Logger

  constructor(env: EnhancedWorkerEnv) {
    this.env = env
    this.logger = createLogger(env)
  }

  async uploadUserContent(userId: string, fileName: string, content: ArrayBuffer | string): Promise<string> {
    const key = `usercontent/${userId}/${Date.now()}-${fileName}`
    await this.env.USER_CONTENT_R2.put(key, content, {
      httpMetadata: {
        contentType: getContentType(fileName),
      },
    })

    return key
  }

  async getUserContent(key: string): Promise<unknown | null> {
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
      data: {},
    }
    const backupKey = `backups/${userId}/${Date.now()}.json`
    await this.env.BACKUP_R2.put(backupKey, JSON.stringify(backupData))
    return backupKey
  }
}
