/**
 * AI Store - 全局 AI 状态管理
 * 
 * [Refactored v5.0 - Service Manager Integration]
 * 本模块现在集成了新的 AIServiceManager，提供运行时动态加载能力
 * 同时保持向后兼容性，支持现有的所有 AI 功能
 */
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAIService } from './ai/serviceStore'
import * as aiModules from './ai/index'

// 为保持向后兼容，重新导出常用的模型工具函数
export {
  getRecommendedModels,
  getAllModels,
  getDefaultModel,
  getVendor,
  estimateSize,
  getQuantization,
  getParams,
  saveLastModel,
  useAIService,
} from './ai/index'

export const useAIStore = defineStore('ai', () => {
  // 使用新的 AI 服务管理器
  const aiService = useAIService()

  // --- 状态 (优先使用新服务管理器的状态) ---
  const isSupported = aiService.isSupported
  const isLoading = aiService.isLoading
  const isModelLoaded = aiService.isModelLoaded
  const loadProgress = aiService.loadProgress
  const loadStatus = aiService.loadStatus
  const error = aiService.error
  const currentModel = aiService.currentModel
  const performance = aiService.performance

  // 对话历史 (保持现有功能)
  const conversationHistory = aiModules.conversationHistory

  // --- 引擎控制方法 (使用新服务管理器) ---
  const initialize = aiService.initialize
  const checkSupport = aiService.checkSupport
  const loadModel = aiService.loadModel
  const unloadModel = aiService.unloadModel
  const isReady = aiService.isReady
  const cleanup = aiService.cleanup

  // --- 模型管理方法 (使用新服务管理器) ---
  const getRecommendedModels = aiService.getRecommendedModels
  const getAllModels = aiService.getAllModels

  // 保持现有的模型工具函数
  const getDefaultModel = aiModules.getDefaultModel
  const getVendor = aiModules.getVendor
  const estimateSize = aiModules.estimateSize
  const getQuantization = aiModules.getQuantization
  const getParams = aiModules.getParams
  const saveLastModel = aiModules.saveLastModel

  // --- 核心 AI 推理 (使用新服务管理器) ---
  const inference = aiService.inference

  // --- 保持现有的高级 AI 功能 ---
  const chat = aiModules.chat
  const addToHistory = aiModules.addToHistory
  const clearHistory = aiModules.clearHistory

  const summarizeChapter = aiModules.summarizeChapter
  const recapPrevious = aiModules.recapPrevious
  const askAboutBook = aiModules.askAboutBook
  const detectHomophones = aiModules.detectHomophones
  const detectSlang = aiModules.detectSlang
  const detectMemes = aiModules.detectMemes
  const buildCharacterGraph = aiModules.buildCharacterGraph
  const generateSmartRecap = aiModules.generateSmartRecap

  // --- RAG 知识库 (保持现有功能) ---
  const rag = aiModules.useRag()
  const indexChapter = (title: string, content: string, index: number) => {
    rag.addDocuments([{
      id: `ch-${index}`,
      content: content.slice(0, 5000), // 限制长度
      metadata: { title, index }
    }])
  }
  const searchRag = rag.search
  const clearRag = rag.clear

  // --- 工具方法 ---
  const analyzeInChunks = aiModules.analyzeInChunks

  // 缓存管理方法
  const getCacheStats = aiService.getCacheStats
  const clearModelCache = aiService.clearModelCache
  const getCachedModels = aiService.getCachedModels
  const preloadRecommendedModels = aiService.preloadRecommendedModels

  return {
    // 状态 (使用新服务管理器)
    isSupported,
    isLoading,
    isModelLoaded,
    loadProgress,
    loadStatus,
    error,
    currentModel,
    performance,
    conversationHistory,

    // 计算属性
    isReady,

    // 服务管理器方法
    initialize,
    checkSupport,
    loadModel,
    unloadModel,
    cleanup,
    inference,

    // 模型管理
    getRecommendedModels,
    getAllModels,
    getDefaultModel,
    getVendor,
    estimateSize,
    getQuantization,
    getParams,
    saveLastModel,

    // AI 功能 (保持现有)
    chat,
    addToHistory,
    clearHistory,
    summarizeChapter,
    recapPrevious,
    askAboutBook,
    generateSmartRecap,
    detectHomophones,
    detectSlang,
    detectMemes,
    buildCharacterGraph,

    // RAG 知识库
    indexChapter,
    searchRag,
    clearRag,

    // 工具方法
    analyzeInChunks,

    // 缓存管理
    getCacheStats,
    clearModelCache,
    getCachedModels,
    preloadRecommendedModels,

    // 兼容性方法
    resetAutoUnloadTimer: aiModules.resetAutoUnloadTimer,
    clearAutoUnloadTimer: aiModules.clearAutoUnloadTimer,
  }
})
