/**
 * AI Store - 全局 AI 状态管理
 * 
 * [Refactored v4.0]
 * 本模块已重构为模块化架构。核心逻辑分散在 ./ai/ 子模块中：
 * - engine.ts: WebLLM 引擎生命周期
 * - chat.ts: 对话与性能追踪
 * - detectors.ts: 黑话/梗/角色图谱检测
 * - summarizer.ts: 摘要/回顾/问答
 * - models.ts: 模型元数据工具
 */
import { defineStore } from 'pinia'
import { computed } from 'vue'
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
} from './ai/index'

export const useAIStore = defineStore('ai', () => {
  // --- 状态 (通过计算属性或直接引用模块中的 Ref) ---

  // 基础状态
  const isSupported = aiModules.engineState.isSupported
  const isLoading = aiModules.engineState.isLoading
  const isModelLoaded = aiModules.engineState.isModelLoaded
  const loadProgress = aiModules.engineState.loadProgress
  const loadStatus = aiModules.engineState.loadStatus
  const error = aiModules.engineState.error
  const currentModel = aiModules.engineState.currentModel
  const engine = aiModules.engineState.engine

  // 对话历史
  const conversationHistory = aiModules.conversationHistory

  // 性能指标
  const performance = aiModules.performanceState

  // --- 模型元数据方法 (直接映射) ---
  const getRecommendedModels = aiModules.getRecommendedModels
  const getAllModels = aiModules.getAllModels
  const getDefaultModel = aiModules.getDefaultModel
  const getVendor = aiModules.getVendor
  const estimateSize = aiModules.estimateSize
  const getQuantization = aiModules.getQuantization
  const getParams = aiModules.getParams
  const saveLastModel = aiModules.saveLastModel

  // --- 引擎控制方法 (映射) ---
  const checkSupport = aiModules.checkSupport
  const loadModel = aiModules.loadModel
  const unloadModel = aiModules.unloadModel
  const resetAutoUnloadTimer = aiModules.resetAutoUnloadTimer
  const clearAutoUnloadTimer = aiModules.clearAutoUnloadTimer

  // --- 核心 AI 方法 (映射) ---
  const chat = aiModules.chat
  const addToHistory = aiModules.addToHistory
  const clearHistory = aiModules.clearHistory

  // --- 高级 AI 功能 (映射) ---
  const summarizeChapter = aiModules.summarizeChapter
  const recapPrevious = aiModules.recapPrevious
  const askAboutBook = aiModules.askAboutBook
  const detectHomophones = aiModules.detectHomophones
  const detectSlang = aiModules.detectSlang
  const detectMemes = aiModules.detectMemes
  const buildCharacterGraph = aiModules.buildCharacterGraph
  const generateSmartRecap = aiModules.generateSmartRecap

  // --- RAG 知识库 (映射) ---
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

  // 综合状态
  const isReady = computed(() => isModelLoaded.value && engine.value !== null)

  return {
    // 状态
    isSupported,
    isLoading,
    isModelLoaded,
    loadProgress,
    loadStatus,
    error,
    currentModel,
    engine,
    conversationHistory,
    performance,
    isReady,

    // 模型管理
    getRecommendedModels,
    getAllModels,
    getDefaultModel,
    getVendor,
    estimateSize,
    getQuantization,
    getParams,
    saveLastModel,

    // 引擎控制
    checkSupport,
    loadModel,
    unloadModel,
    resetAutoUnloadTimer,
    clearAutoUnloadTimer,

    // AI 核心
    chat,
    addToHistory,
    clearHistory,

    // AI 功能
    summarizeChapter,
    recapPrevious,
    askAboutBook,
    generateSmartRecap,
    detectHomophones,
    detectSlang,
    detectMemes,
    buildCharacterGraph,

    // 工具
    // 工具
    indexChapter,
    analyzeInChunks,
  }
})
