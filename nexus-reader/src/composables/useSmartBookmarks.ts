/**
 * 📚 智能书签模块
 * 为阅读器提供 AI 增强的书签功能
 * 
 * 功能:
 * - 自动生成上下文摘要
 * - 记录阅读情绪 (基于停留时间推断)
 * - 关联当前章节角色
 * - 跨设备同步 (IndexedDB)
 */

import { ref, computed } from 'vue'
import { openDB, type IDBPDatabase } from 'idb'

// 数据库配置
const DB_NAME = 'nexus-bookmarks'
const DB_VERSION = 1
const STORE_NAME = 'smart-bookmarks'

// 阅读情绪类型
export type ReadingMood = 'engaged' | 'confused' | 'bored' | 'excited'

// 智能书签接口
export interface SmartBookmark {
  id: string
  bookId: string
  chapterIndex: number
  chapterTitle: string
  position: number // 字符位置
  timestamp: number
  // AI 生成的上下文摘要
  context: string
  // 摘录的原文片段
  snippet: string
  // 阅读情绪
  mood: ReadingMood
  // 关联角色
  characters: string[]
  // 用户备注
  note?: string
}

let dbInstance: IDBPDatabase | null = null

/**
 * 获取数据库实例
 */
async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('bookId', 'bookId')
        store.createIndex('timestamp', 'timestamp')
      }
    }
  })

  return dbInstance
}

/**
 * 生成书签 ID
 */
function generateId(): string {
  return `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 根据停留时间推断阅读情绪
 */
export function inferMood(
  readingTimeSeconds: number,
  textLength: number
): ReadingMood {
  // 计算每字符平均阅读时间
  const avgTimePerChar = readingTimeSeconds / Math.max(textLength, 1)

  // 标准阅读速度: 约 3-5 字/秒 (0.2-0.33 秒/字)
  if (avgTimePerChar > 0.5) {
    // 读得很慢，可能困惑
    return 'confused'
  }
  if (avgTimePerChar < 0.15) {
    // 读得很快，可能略读/无聊
    return 'bored'
  }
  if (avgTimePerChar >= 0.25 && avgTimePerChar <= 0.4) {
    // 正常偏慢，专注阅读
    return 'engaged'
  }

  return 'engaged'
}

/**
 * 提取文本中的角色名
 * 简单实现：匹配常见人名模式
 */
export function extractCharacters(text: string): string[] {
  const characters = new Set<string>()

  // 对话引用中的说话者
  const dialoguePattern = /["「]([^"」]{1,20})["」]\s*[，,]?\s*(.{1,4})(说|道|喊|叫|问|答|笑|叹)/g
  let match
  while ((match = dialoguePattern.exec(text)) !== null) {
    if (match[2]) {
      characters.add(match[2].trim())
    }
  }

  // 常见称呼
  const namePattern = /([\u4e00-\u9fa5]{2,4})(老师|师傅|师父|前辈|大人|公子|小姐|姑娘|兄|弟|姐|妹)/g
  while ((match = namePattern.exec(text)) !== null) {
    characters.add(match[1])
  }

  return Array.from(characters).slice(0, 5)
}

/**
 * 智能书签组合式函数
 */
export function useSmartBookmarks() {
  const bookmarks = ref<SmartBookmark[]>([])
  const isLoading = ref(false)

  const sortedBookmarks = computed(() =>
    [...bookmarks.value].sort((a, b) => b.timestamp - a.timestamp)
  )

  /**
   * 加载指定书籍的书签
   */
  async function loadBookmarks(bookId: string): Promise<void> {
    isLoading.value = true
    try {
      const db = await getDB()
      const all = await db.getAllFromIndex(STORE_NAME, 'bookId', bookId)
      bookmarks.value = all as SmartBookmark[]
    } catch (e) {
      console.error('[SmartBookmarks] loadBookmarks error:', e)
      bookmarks.value = []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 添加智能书签
   */
  async function addBookmark(
    bookId: string,
    chapterIndex: number,
    chapterTitle: string,
    position: number,
    snippet: string,
    context: string,
    mood: ReadingMood = 'engaged',
    note?: string
  ): Promise<SmartBookmark> {
    const bookmark: SmartBookmark = {
      id: generateId(),
      bookId,
      chapterIndex,
      chapterTitle,
      position,
      timestamp: Date.now(),
      context,
      snippet: snippet.slice(0, 200),
      mood,
      characters: extractCharacters(snippet),
      note,
    }

    try {
      const db = await getDB()
      await db.put(STORE_NAME, bookmark)
      bookmarks.value.push(bookmark)
    } catch (e) {
      console.error('[SmartBookmarks] addBookmark error:', e)
    }

    return bookmark
  }

  /**
   * 快速书签 (无 AI 摘要)
   */
  async function quickBookmark(
    bookId: string,
    chapterIndex: number,
    chapterTitle: string,
    position: number,
    snippet: string
  ): Promise<SmartBookmark> {
    return addBookmark(
      bookId,
      chapterIndex,
      chapterTitle,
      position,
      snippet,
      `第${chapterIndex + 1}章 ${chapterTitle} - 阅读进度`,
      'engaged'
    )
  }

  /**
   * 删除书签
   */
  async function removeBookmark(id: string): Promise<void> {
    try {
      const db = await getDB()
      await db.delete(STORE_NAME, id)
      bookmarks.value = bookmarks.value.filter(b => b.id !== id)
    } catch (e) {
      console.error('[SmartBookmarks] removeBookmark error:', e)
    }
  }

  /**
   * 更新书签备注
   */
  async function updateNote(id: string, note: string): Promise<void> {
    try {
      const db = await getDB()
      const bookmark = await db.get(STORE_NAME, id) as SmartBookmark | undefined
      if (bookmark) {
        bookmark.note = note
        await db.put(STORE_NAME, bookmark)

        const idx = bookmarks.value.findIndex(b => b.id === id)
        if (idx >= 0) {
          bookmarks.value[idx] = bookmark
        }
      }
    } catch (e) {
      console.error('[SmartBookmarks] updateNote error:', e)
    }
  }

  /**
   * 获取最近的书签
   */
  async function getRecentBookmarks(limit = 10): Promise<SmartBookmark[]> {
    try {
      const db = await getDB()
      const all = await db.getAllFromIndex(STORE_NAME, 'timestamp')
      return (all as SmartBookmark[])
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit)
    } catch (e) {
      console.error('[SmartBookmarks] getRecentBookmarks error:', e)
      return []
    }
  }

  /**
   * 清空指定书籍的书签
   */
  async function clearBookmarks(bookId: string): Promise<void> {
    try {
      const db = await getDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index('bookId')

      let cursor = await index.openCursor(bookId)
      while (cursor) {
        await cursor.delete()
        cursor = await cursor.continue()
      }

      await tx.done
      bookmarks.value = bookmarks.value.filter(b => b.bookId !== bookId)
    } catch (e) {
      console.error('[SmartBookmarks] clearBookmarks error:', e)
    }
  }

  return {
    // 状态
    bookmarks,
    sortedBookmarks,
    isLoading,

    // 方法
    loadBookmarks,
    addBookmark,
    quickBookmark,
    removeBookmark,
    updateNote,
    getRecentBookmarks,
    clearBookmarks,

    // 工具函数
    inferMood,
    extractCharacters,
  }
}
