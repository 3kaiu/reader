/**
 * 🔒 webLocks - 多標籤頁鎖定工具
 * 使用 Web Locks API 協調多個標籤頁之間的資源爭用
 * 例如：確保只有一個標籤頁加載 AI 引擎，防止顯存溢出
 */
import { logger } from '../utils/logger'

export const webLocks = {
  /**
   * 檢查是否支持 Web Locks
   */
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'locks' in navigator
  },

  /**
   * 獲取排他鎖並執行操作
   * @param lockName 鎖名稱 (如 'ai-engine-load')
   * @param callback 獲取鎖後要執行的異步函數
   * @param options 配置 (如 ifAvailable: true 則獲取不到鎖立即返回)
   */
  async withExclusive<T>(
    lockName: string,
    callback: () => Promise<T>,
    options: { ifAvailable?: boolean } = {}
  ): Promise<T | null> {
    if (!this.isSupported()) return await callback()

    try {
      return await navigator.locks.request(lockName, options, async (lock) => {
        if (options.ifAvailable && !lock) {
          logger.warn(`[WebLocks] 鎖已被佔用: ${lockName}`)
          return null
        }
        return await callback()
      }) as T | null
    } catch (e) {
      logger.error(`[WebLocks] 鎖定操作出錯: ${lockName}`, e as Error)
      throw e // 重新抛出错误，让调用方处理
    }
  },

  /**
   * 檢查某個鎖是否已被佔用 (非阻塞)
   */
  async isLocked(lockName: string): Promise<boolean> {
    if (!this.isSupported()) return false
    const state = await navigator.locks.query()
    return state.held?.some(l => l.name === lockName) || false
  }
}
