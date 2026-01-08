/**
 * 💬 AI Chat - 对话功能模块
 * 从 stores/ai.ts 提取的对话逻辑与历史管理
 */
import { ref } from 'vue'
import { AI_DEFAULT_CONTEXT_WINDOW } from '../../constants/ai'
import type { AIRequestParams } from '../../types/ai'
import { engineState, performanceState, resetAutoUnloadTimer } from './engine'

// 对话历史
export const conversationHistory = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([])
const MAX_HISTORY_LENGTH = 10

/**
 * 添加到对话历史
 */
export function addToHistory(role: 'user' | 'assistant', content: string) {
  conversationHistory.value.push({ role, content })
  if (conversationHistory.value.length > MAX_HISTORY_LENGTH * 2) {
    conversationHistory.value = conversationHistory.value.slice(-MAX_HISTORY_LENGTH * 2)
  }
}

/**
 * 清除对话历史
 */
export function clearHistory() {
  conversationHistory.value = []
}

/**
 * 生成回复 (支持 JSON Mode 和 Seed)
 */
export async function chat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number
    topP?: number
    maxTokens?: number
    onStream?: (text: string) => void
    jsonMode?: boolean
    seed?: number
    presencePenalty?: number
    frequencyPenalty?: number
  }
): Promise<string> {
  // RAG 增強 (如果存在首條 system 消息且有 user 消息)
  const userMsg = messages.find(m => m.role === 'user')?.content
  if (userMsg && messages[0]?.role === 'system') {
    try {
      const { useRag } = await import('./rag')
      const rag = useRag()
      const context = await rag.generateContextPrompt(userMsg)
      if (context) {
        messages = [...messages]
        messages[0] = { ...messages[0], content: messages[0].content + context }
      }
    } catch (e) { /* 忽略 RAG 錯誤 */ }
  }

  // 重置自动卸载定时器
  resetAutoUnloadTimer()

  if (!engineState.engine.value || !engineState.isModelLoaded.value) {
    throw new Error('模型未加载')
  }

  // 获取设置参数
  let defaultParams = {
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 2048,
    presencePenalty: 0.0,
    frequencyPenalty: 0.0,
    contextWindow: AI_DEFAULT_CONTEXT_WINDOW,
  }

  try {
    const { useSettingsStore } = await import('../settings')
    const settingsStore = useSettingsStore()
    const aiParams = settingsStore.config.aiParams
    defaultParams = {
      temperature: aiParams.temperature,
      topP: aiParams.topP,
      maxTokens: aiParams.maxTokens,
      presencePenalty: aiParams.presencePenalty,
      frequencyPenalty: aiParams.frequencyPenalty,
      contextWindow: aiParams.contextWindow || AI_DEFAULT_CONTEXT_WINDOW,
    }
  } catch (e) {
    // 忽略导入错误，使用默认值
  }

  const {
    temperature = defaultParams.temperature,
    topP = defaultParams.topP,
    maxTokens = defaultParams.maxTokens,
    onStream,
    jsonMode = false,
    seed,
    presencePenalty = defaultParams.presencePenalty,
    frequencyPenalty = defaultParams.frequencyPenalty,
  } = options || {}

  const requestParams: AIRequestParams = {
    messages,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    context_window: defaultParams.contextWindow,
  } as AIRequestParams

  if (jsonMode) {
    requestParams.response_format = { type: 'json_object' }
  }

  if (seed !== undefined) {
    requestParams.seed = seed
  }

  if (presencePenalty !== 0) {
    requestParams.presence_penalty = presencePenalty
  }
  if (frequencyPenalty !== 0) {
    requestParams.frequency_penalty = frequencyPenalty
  }

  try {
    const startTime = Date.now()
    let tokenCount = 0
    const engine = engineState.engine.value

    if (onStream) {
      let fullResponse = ''
      const asyncChunkGenerator = await (engine.chat.completions.create as any)({
        ...requestParams,
        stream: true,
        stream_options: { include_usage: true },
      })

      for await (const chunk of asyncChunkGenerator) {
        const delta = chunk.choices[0]?.delta?.content || ''
        fullResponse += delta
        onStream(fullResponse)

        if (chunk.usage) {
          tokenCount = chunk.usage.completion_tokens || 0
        }
      }

      const elapsed = (Date.now() - startTime) / 1000
      performanceState.value = {
        tokensPerSecond: tokenCount > 0 ? Math.round(tokenCount / elapsed) : 0,
        totalTokens: tokenCount,
        generationTime: elapsed,
        lastUpdated: Date.now(),
      }

      return fullResponse
    } else {
      const response = await engine.chat.completions.create(requestParams as any)
      const elapsed = (Date.now() - startTime) / 1000
      tokenCount = response.usage?.completion_tokens || 0

      performanceState.value = {
        tokensPerSecond: tokenCount > 0 ? Math.round(tokenCount / elapsed) : 0,
        totalTokens: tokenCount,
        generationTime: elapsed,
        lastUpdated: Date.now(),
      }

      return response.choices[0]?.message?.content || ''
    }
  } catch (e) {
    throw new Error(`生成失败: ${e instanceof Error ? e.message : '未知错误'}`)
  }
}
