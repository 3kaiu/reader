import { createLogger, type Logger } from '../../shared/logger.ts'
import type { JsonObject, R2ObjectLike } from '../../shared/types.ts'
import type { EnhancedWorkerEnv } from '../types.ts'
import { parseStoredPreferences } from './shared.ts'

export class UserPreferencesSystem {
  private env: EnhancedWorkerEnv
  private logger: Logger

  constructor(env: EnhancedWorkerEnv) {
    this.env = env
    this.logger = createLogger(env)
  }

  async savePreferences(userId: string, preferences: JsonObject): Promise<void> {
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

  async getPreferences(userId: string): Promise<JsonObject> {
    try {
      const result = await this.env.USER_PREFERENCES_DB.prepare(`
        SELECT preferences FROM user_preferences WHERE user_id = ?
      `).bind(userId).first<{ preferences?: string }>()

      return typeof result?.preferences === 'string' ? parseStoredPreferences(result.preferences) : {}
    } catch (error) {
      this.logger.error('Failed to get user preferences:', error)
      return {}
    }
  }

  async backupPreferences(userId: string, keep = 5): Promise<void> {
    try {
      const preferences = await this.getPreferences(userId)
      const backupKey = `preferences/${userId}/${Date.now()}.json`

      await this.env.BACKUP_R2.put(backupKey, JSON.stringify({
        userId,
        preferences,
        timestamp: new Date().toISOString(),
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

  private async listUserBackups(userId: string): Promise<R2ObjectLike[]> {
    const backups: R2ObjectLike[] = []
    const prefix = `preferences/${userId}/`

    for await (const object of this.env.BACKUP_R2.list({ prefix })) {
      backups.push(object)
    }

    return backups.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
  }
}
