/**
 * 音色管理 Store - 集成新的TTSServiceManager
 * 提供Vue组合式API接口，兼容现有代码，支持动态加载
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { VoiceModel, VoiceMetadata, VoiceTrainingProgress } from '@/types/voice'
import { logger } from '@/utils/logger'
import { voiceApi } from '@/api'
import { ttsServiceManager } from '@/services/ttsServiceManager'

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
  async function saveDefaultVoiceId(voiceId: string | null) {
    try {
      // 1. 同步到后端
      if (voiceId) {
        await voiceApi.saveConfig('default-voice-id', voiceId)
      } else {
        // 这里后端没有删除配置的接口，存为空字符串
        await voiceApi.saveConfig('default-voice-id', '')
      }

      // 2. 保存到本地
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
      // 1. 从后端加载元数据
      const apiRes = await voiceApi.getMetadata()
      if (apiRes.isSuccess && apiRes.data.length > 0) {
        // 更新本地元数据
        const remoteVoices = apiRes.data.map(m => ({
          id: m.id,
          name: m.name,
          modelSize: m.modelSize,
          sampleDuration: m.sampleDuration,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          version: '1.0',
          metadata: {
            language: m.metadata.language || 'zh',
            description: m.metadata.description || '',
          }
        }))

        // 比较并保存缺失到 IndexedDB (元数据部分)
        const db = await openDB()
        const transaction = db.transaction([STORE_VOICES], 'readwrite')
        const store = transaction.objectStore(STORE_VOICES)
        for (const v of remoteVoices) {
          store.put(v)
        }

        voices.value = remoteVoices
      } else {
        // 如果后端为空，从本地 IndexedDB 加载并同步到后端
        const db = await openDB()
        const transaction = db.transaction([STORE_VOICES], 'readonly')
        const store = transaction.objectStore(STORE_VOICES)
        const request = store.getAll()

        await new Promise<void>((resolve, reject) => {
          request.onsuccess = async () => {
            const localVoices = request.result || []
            voices.value = localVoices

            // 同步本地元数据到后端
            if (localVoices.length > 0) {
              for (const v of localVoices) {
                await voiceApi.saveMetadata({
                  id: v.id,
                  name: v.name,
                  type: 'custom',
                  metadata: {
                    language: v.metadata.language,
                    description: v.metadata.description || '',
                  },
                  modelSize: v.modelSize,
                  sampleDuration: v.sampleDuration,
                  createdAt: v.createdAt,
                  updatedAt: v.updatedAt || v.createdAt,
                })
              }
            }
            resolve()
          }
          request.onerror = () => reject(request.error)
        })
      }

      // 2. 加载默认设置
      const configRes = await voiceApi.getConfig('default-voice-id')
      if (configRes.isSuccess && configRes.data) {
        defaultVoiceId.value = configRes.data
      } else {
        loadDefaultVoiceId() // 退回到本地
      }
    } catch (e) {
      error.value = '加载音色列表失败'
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

      // 同步元数据到后端
      await voiceApi.saveMetadata({
        id: voice.id,
        name: voice.name,
        type: 'custom',
        metadata: {
          language: voice.metadata.language,
          description: voice.metadata.description || '',
        },
        modelSize: voice.modelSize,
        sampleDuration: voice.sampleDuration,
        createdAt: voice.createdAt,
        updatedAt: voice.updatedAt || voice.createdAt,
      })
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
        await saveDefaultVoiceId(null)
      }

      // 同步到后端
      await voiceApi.deleteMetadata(voiceId)
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

  // 初始化：加载音色列表和TTS服务
  loadVoices()
  
  // TTS服务集成方法
  const initializeTTSService = () => ttsServiceManager.initialize()
  const loadTTSEngine = () => ttsServiceManager.loadEngine()
  const speak = (text: string, voiceId?: string) => ttsServiceManager.speak(text, voiceId)
  const stopSpeaking = () => ttsServiceManager.stop()
  const togglePause = () => ttsServiceManager.togglePause()
  const unloadTTSEngine = () => ttsServiceManager.unloadEngine()
  const clearTTSCache = () => ttsServiceManager.clearTTSCache()
  
  // TTS模型管理方法
  const getAvailableVoices = () => ttsServiceManager.getAvailableVoices()
  const isTTSModelCached = (voiceId: string) => ttsServiceManager.isTTSModelCached(voiceId)
  const preloadTTSModel = (voiceId: string) => ttsServiceManager.preloadTTSModel(voiceId)
  const getCachedTTSModels = () => ttsServiceManager.getCachedTTSModels()
  const removeCachedTTSModel = (voiceId: string) => ttsServiceManager.removeCachedTTSModel(voiceId)
  
  // TTS状态
  const isTTSSupported = computed(() => ttsServiceManager.isSupported.value)
  const isTTSLoading = computed(() => ttsServiceManager.isLoading.value)
  const isTTSEngineLoaded = computed(() => ttsServiceManager.isEngineLoaded.value)
  const ttsLoadProgress = computed(() => ttsServiceManager.loadProgress.value)
  const ttsLoadStatus = computed(() => ttsServiceManager.loadStatus.value)
  const ttsError = computed(() => ttsServiceManager.error.value)
  const isSpeaking = computed(() => ttsServiceManager.isSpeaking.value)
  const isPaused = computed(() => ttsServiceManager.isPaused.value)
  const ttsPerformance = computed(() => ttsServiceManager.performance.value)

  return {
    // 原有状态和方法
    voices,
    isLoading,
    error,
    trainingProgress,
    defaultVoiceId,
    defaultVoice,
    loadVoices,
    addVoice,
    deleteVoice,
    getVoiceModel,
    updateVoice,
    saveDefaultVoiceId,
    updateTrainingProgress,
    clearTrainingProgress,
    
    // TTS服务集成
    initializeTTSService,
    loadTTSEngine,
    speak,
    stopSpeaking,
    togglePause,
    unloadTTSEngine,
    clearTTSCache,
    
    // TTS模型管理
    getAvailableVoices,
    isTTSModelCached,
    preloadTTSModel,
    getCachedTTSModels,
    removeCachedTTSModel,
    
    // TTS状态
    isTTSSupported,
    isTTSLoading,
    isTTSEngineLoaded,
    ttsLoadProgress,
    ttsLoadStatus,
    ttsError,
    isSpeaking,
    isPaused,
    ttsPerformance,
  }
})
