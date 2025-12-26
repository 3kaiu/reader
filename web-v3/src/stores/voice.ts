/**
 * 音色管理 Store
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { VoiceModel, VoiceMetadata, VoiceTrainingProgress } from '@/types/voice'
import { logger } from '@/utils/logger'

const DB_NAME = 'voice-db'
const DB_VERSION = 1
const STORE_VOICES = 'voices'
const STORE_MODELS = 'voice_models'

// IndexedDB 操作
let dbInstance: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 音色元数据存储
      if (!db.objectStoreNames.contains(STORE_VOICES)) {
        const voiceStore = db.createObjectStore(STORE_VOICES, { keyPath: 'id' })
        voiceStore.createIndex('createdAt', 'createdAt', { unique: false })
        voiceStore.createIndex('name', 'name', { unique: false })
      }

      // 音色模型文件存储
      if (!db.objectStoreNames.contains(STORE_MODELS)) {
        db.createObjectStore(STORE_MODELS, { keyPath: 'voiceId' })
      }
    }
  })
}

export const useVoiceStore = defineStore('voice', () => {
  // 状态
  const voices = ref<VoiceModel[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const trainingProgress = ref<Record<string, VoiceTrainingProgress>>({})
  const defaultVoiceId = ref<string | null>(null)

  // 计算属性
  const defaultVoice = computed(() => {
    if (!defaultVoiceId.value) return null
    return voices.value.find(v => v.id === defaultVoiceId.value) || null
  })

  // 从 LocalStorage 加载默认音色 ID
  function loadDefaultVoiceId() {
    try {
      const saved = localStorage.getItem('default-voice-id')
      if (saved) {
        defaultVoiceId.value = saved
      }
    } catch (e) {
      logger.error('加载默认音色失败', e as Error)
    }
  }

  // 保存默认音色 ID
  function saveDefaultVoiceId(voiceId: string | null) {
    try {
      if (voiceId) {
        localStorage.setItem('default-voice-id', voiceId)
      } else {
        localStorage.removeItem('default-voice-id')
      }
      defaultVoiceId.value = voiceId
    } catch (e) {
      logger.error('保存默认音色失败', e as Error)
    }
  }

  // 加载所有音色
  async function loadVoices() {
    isLoading.value = true
    error.value = null

    try {
      const db = await openDB()
      const transaction = db.transaction([STORE_VOICES], 'readonly')
      const store = transaction.objectStore(STORE_VOICES)
      const request = store.getAll()

      return new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          voices.value = request.result || []
          loadDefaultVoiceId()
          resolve()
        }
        request.onerror = () => {
          error.value = '加载音色列表失败'
          reject(request.error)
        }
      })
    } catch (e) {
      error.value = '数据库连接失败'
      logger.error('加载音色列表失败', e as Error)
      throw e
    } finally {
      isLoading.value = false
    }
  }

  // 添加音色
  async function addVoice(voice: VoiceModel, modelData: ArrayBuffer): Promise<void> {
    try {
      const db = await openDB()
      const transaction = db.transaction([STORE_VOICES, STORE_MODELS], 'readwrite')

      // 保存元数据
      const voiceStore = transaction.objectStore(STORE_VOICES)
      await new Promise<void>((resolve, reject) => {
        const request = voiceStore.put(voice)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })

      // 保存模型文件
      const modelStore = transaction.objectStore(STORE_MODELS)
      await new Promise<void>((resolve, reject) => {
        const request = modelStore.put({ voiceId: voice.id, data: modelData })
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })

      // 更新本地状态
      const index = voices.value.findIndex(v => v.id === voice.id)
      if (index >= 0) {
        voices.value[index] = voice
      } else {
        voices.value.push(voice)
      }
    } catch (e) {
      error.value = '保存音色失败'
      logger.error('添加音色失败', e as Error)
      throw e
    }
  }

  // 删除音色
  async function deleteVoice(voiceId: string): Promise<void> {
    try {
      const db = await openDB()
      const transaction = db.transaction([STORE_VOICES, STORE_MODELS], 'readwrite')

      // 删除元数据
      const voiceStore = transaction.objectStore(STORE_VOICES)
      await new Promise<void>((resolve, reject) => {
        const request = voiceStore.delete(voiceId)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })

      // 删除模型文件
      const modelStore = transaction.objectStore(STORE_MODELS)
      await new Promise<void>((resolve, reject) => {
        const request = modelStore.delete(voiceId)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })

      // 更新本地状态
      voices.value = voices.value.filter(v => v.id !== voiceId)

      // 如果删除的是默认音色，清除默认设置
      if (defaultVoiceId.value === voiceId) {
        saveDefaultVoiceId(null)
      }
    } catch (e) {
      error.value = '删除音色失败'
      logger.error('删除音色失败', e as Error)
      throw e
    }
  }

  // 获取音色模型数据
  async function getVoiceModel(voiceId: string): Promise<ArrayBuffer | null> {
    try {
      const db = await openDB()
      const transaction = db.transaction([STORE_MODELS], 'readonly')
      const store = transaction.objectStore(STORE_MODELS)
      const request = store.get(voiceId)

      return new Promise<ArrayBuffer | null>((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result
          resolve(result?.data || null)
        }
        request.onerror = () => reject(request.error)
      })
    } catch (e) {
      logger.error('获取音色模型失败', e as Error)
      return null
    }
  }

  // 更新音色元数据
  async function updateVoice(voiceId: string, updates: Partial<VoiceModel>): Promise<void> {
    try {
      const voice = voices.value.find(v => v.id === voiceId)
      if (!voice) {
        throw new Error('音色不存在')
      }

      const updated = {
        ...voice,
        ...updates,
        updatedAt: Date.now(),
      }

      const db = await openDB()
      const transaction = db.transaction([STORE_VOICES], 'readwrite')
      const store = transaction.objectStore(STORE_VOICES)
      await new Promise<void>((resolve, reject) => {
        const request = store.put(updated)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })

      // 更新本地状态
      const index = voices.value.findIndex(v => v.id === voiceId)
      if (index >= 0) {
        voices.value[index] = updated
      }
    } catch (e) {
      error.value = '更新音色失败'
      logger.error('更新音色失败', e as Error)
      throw e
    }
  }

  // 更新训练进度
  function updateTrainingProgress(progress: VoiceTrainingProgress) {
    trainingProgress.value = {
      ...trainingProgress.value,
      [progress.voiceId]: progress,
    }
  }

  // 清除训练进度
  function clearTrainingProgress(voiceId: string) {
    const newProgress = { ...trainingProgress.value }
    delete newProgress[voiceId]
    trainingProgress.value = newProgress
  }

  // 初始化：加载音色列表
  loadVoices()

  return {
    // 状态
    voices,
    isLoading,
    error,
    trainingProgress,
    defaultVoiceId,
    defaultVoice,
    // 方法
    loadVoices,
    addVoice,
    deleteVoice,
    getVoiceModel,
    updateVoice,
    saveDefaultVoiceId,
    updateTrainingProgress,
    clearTrainingProgress,
  }
})
