import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAIStore } from './ai'
import type { ChapterInsight, InsightCacheItem } from '@/types/insights'
import { logger } from '@/utils/logger'

const DB_NAME = 'reader-insights'
const STORE_NAME = 'chapter-insights'
const MANUAL_STORE_NAME = 'manual-characters'

export const useAIInsightsStore = defineStore('aiInsights', () => {
  const aiStore = useAIStore()
  const currentInsight = ref<ChapterInsight | null>(null)
  const isAnalyzing = ref(false)

  // IndexedDB 支持
  let db: IDBDatabase | null = null

  async function initDB() {
    if (db) return db
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2) // Bump version to 2
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: ['bookUrl', 'chapterIndex'] })
        }
        if (!database.objectStoreNames.contains(MANUAL_STORE_NAME)) {
          database.createObjectStore(MANUAL_STORE_NAME, { keyPath: ['bookUrl', 'name'] })
        }
      }
      request.onsuccess = () => {
        db = request.result
        resolve(db)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async function getFromCache(bookUrl: string, chapterIndex: number): Promise<ChapterInsight | null> {
    const database = await initDB()
    return new Promise((resolve) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get([bookUrl, chapterIndex])
      request.onsuccess = () => {
        resolve(request.result?.insight || null)
      }
      request.onerror = () => resolve(null)
    })
  }

  async function saveToCache(bookUrl: string, chapterIndex: number, insight: ChapterInsight) {
    const database = await initDB()
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.put({
      bookUrl,
      chapterIndex,
      insight,
      timestamp: Date.now()
    })
  }

  async function analyzeChapter(bookUrl: string, chapterIndex: number, content: string, title?: string) {
    if (isAnalyzing.value) return

    // 1. 尝试从缓存获取
    const cached = await getFromCache(bookUrl, chapterIndex)
    if (cached) {
      currentInsight.value = cached
      return
    }

    if (!aiStore.isModelLoaded) return

    isAnalyzing.value = true
    try {
      const systemPrompt = `你是一个小说分析专家。请从提供的文本中提取出场人物及其背景。
要求：
1. 识别文本中提到的主要人物及其简短描述。
2. 识别人物之间的当前关系（ties）。
3. 识别本章节的情绪氛围（ACTION/CALM/TENSION/SAD）。
4. 必须以严格的 JSON 格式返回，不要包含任何 Markdown 标记或额外说明。

JSON 结构示例：
{
  "characters": [
    { "name": "张三", "description": "隐居的高人", "ties": [{ "to": "李四", "relation": "师徒" }] }
  ],
  "mood": "CALM"
}`

      const response = await aiStore.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请分析以下章节内容：${title ? `《${title}》` : ''}\n\n${content.slice(0, 3000)}` }
      ], {
        jsonMode: true,
        temperature: 0.1
      })

      const cleanJson = response.replace(/```json\s*|\s*```/g, "").trim()
      const insight = JSON.parse(cleanJson) as ChapterInsight

      currentInsight.value = insight
      await saveToCache(bookUrl, chapterIndex, insight)
    } catch (e) {
      logger.error('Failed to analyze chapter insights', e as Error)
    } finally {
      isAnalyzing.value = false
    }
  }

  const allCharacters = ref<any[]>([])
  const allTies = ref<any[]>([])

  async function markAsCharacter(bookUrl: string, name: string, role: 'protagonist' | 'supporting' | 'others' | null) {
    const database = await initDB()
    const transaction = database.transaction(MANUAL_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(MANUAL_STORE_NAME)

    if (role === null) {
      await new Promise((resolve, reject) => {
        const req = store.delete([bookUrl, name])
        req.onsuccess = resolve
        req.onerror = reject
      })
    } else {
      await new Promise((resolve, reject) => {
        const req = store.put({
          bookUrl,
          name,
          role,
          timestamp: Date.now()
        })
        req.onsuccess = resolve
        req.onerror = reject
      })
    }
  }

  async function getManualCharacters(bookUrl: string): Promise<Record<string, string>> {
    const database = await initDB()
    return new Promise((resolve) => {
      const transaction = database.transaction(MANUAL_STORE_NAME, 'readonly')
      const store = transaction.objectStore(MANUAL_STORE_NAME)
      const request = store.getAll()
      request.onsuccess = () => {
        const results = request.result || []
        const map: Record<string, string> = {}
        results.forEach((item: any) => {
          if (item.bookUrl === bookUrl) map[item.name] = item.role
        })
        resolve(map)
      }
      request.onerror = () => resolve({})
    })
  }

  /**
   * 聚合整本书已分析的人物洞察
   */
  async function loadBookInsights(bookUrl: string) {
    const database = await initDB()
    const manualRoles = await getManualCharacters(bookUrl)

    // 聚合逻辑...
    return new Promise<void>((resolve) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.openCursor()

      const charactersMap = new Map<string, any>()
      const relationshipSet = new Set<string>()

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const item = cursor.value
          if (item.bookUrl === bookUrl) {
            const insight = item.insight as ChapterInsight
            insight.characters.forEach(char => {
              if (!charactersMap.has(char.name)) {
                charactersMap.set(char.name, {
                  ...char,
                  appearances: 1,
                  role: manualRoles[char.name] || 'others',
                  isManual: !!manualRoles[char.name]
                })
              } else {
                const existing = charactersMap.get(char.name)
                if (char.description.length > existing.description.length) {
                  existing.description = char.description
                }
                existing.appearances++
              }

              char.ties.forEach(tie => {
                const relId = [char.name, tie.to].sort().join('-')
                if (!relationshipSet.has(relId)) {
                  relationshipSet.add(relId)
                  allTies.value.push({ from: char.name, to: tie.to, relation: tie.relation })
                }
              })
            })
          }
          cursor.continue()
        } else {
          // 加上那些只在手动标注里出现但还没在 AI 洞察里出现的（虽然比较少见）
          Object.entries(manualRoles).forEach(([name, role]) => {
            if (!charactersMap.has(name)) {
              charactersMap.set(name, {
                name,
                description: '手动标注人物',
                ties: [],
                appearances: 0,
                role,
                isManual: true
              })
            }
          })

          allCharacters.value = Array.from(charactersMap.values()).sort((a, b) => {
            // 排序逻辑：主角 > 配角 > 其他 (次数)
            const roleWeight = { protagonist: 100, supporting: 50, others: 10 }
            const weightA = (roleWeight[a.role as keyof typeof roleWeight] || 0) + a.appearances
            const weightB = (roleWeight[b.role as keyof typeof roleWeight] || 0) + b.appearances
            return weightB - weightA
          })
          resolve()
        }
      }
    })
  }

  return {
    currentInsight,
    allCharacters,
    allTies,
    isAnalyzing,
    analyzeChapter,
    loadBookInsights,
    markAsCharacter
  }
})
