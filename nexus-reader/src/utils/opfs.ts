/**
 * 💾 OPFS - Origin Private File System 存儲工具
 * 用於高性能存儲大型二進制文件（如 Piper 模型、WebLLM 緩存）
 * 比 IndexedDB 更快，且不阻塞主線程，支持 Streaming
 */
import { logger } from '../utils/logger'

export const opfsStorage = {
  /**
   * 檢查是否支持 OPFS
   */
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage
  },

  /**
   * 寫入文件到 OPFS
   */
  async writeFile(fileName: string, data: Blob | ArrayBuffer | string): Promise<boolean> {
    if (!this.isSupported()) return false
    try {
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(data)
      await writable.close()
      return true
    } catch (e) {
      logger.error(`[OPFS] 寫入文件失敗: ${fileName}`, e as Error)
      return false
    }
  },

  /**
   * 從 OPFS 讀取文件為 Blob
   */
  async readFile(fileName: string): Promise<Blob | null> {
    if (!this.isSupported()) return null
    try {
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle(fileName)
      const file = await fileHandle.getFile()
      return file
    } catch (e) {
      // 文件不存在時忽略錯誤
      return null
    }
  },

  /**
   * 從 OPFS 讀取序列化數據 (JSON)
   */
  async readJSON<T>(fileName: string): Promise<T | null> {
    const blob = await this.readFile(fileName)
    if (!blob) return null
    try {
      const text = await blob.text()
      return JSON.parse(text)
    } catch (e) {
      return null
    }
  },

  /**
   * 檢查文件是否存在
   */
  async exists(fileName: string): Promise<boolean> {
    if (!this.isSupported()) return false
    try {
      const root = await navigator.storage.getDirectory()
      await root.getFileHandle(fileName)
      return true
    } catch (e) {
      return false
    }
  },

  /**
   * 刪除文件
   */
  async deleteFile(fileName: string): Promise<boolean> {
    if (!this.isSupported()) return false
    try {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(fileName)
      return true
    } catch (e) {
      return false
    }
  },

  /**
   * 列出所有文件
   */
  async listFiles(): Promise<string[]> {
    if (!this.isSupported()) return []
    try {
      const root = await navigator.storage.getDirectory()
      const files: string[] = []
      // @ts-ignore - 某些環境下適配迭代器
      for await (const name of root.keys()) {
        files.push(name)
      }
      return files
    } catch (e) {
      return []
    }
  }
}
