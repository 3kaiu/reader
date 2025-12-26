/**
 * AI 模型相关类型定义
 */

/**
 * WebLLM 模型配置（来自 @mlc-ai/web-llm）
 */
export interface WebLLMModelConfig {
  model_id: string
  vram_required_MB?: number
  low_resource_required?: boolean
  quantization?: string
  [key: string]: unknown
}

/**
 * 推荐的模型候选（内部处理用）
 */
export interface ModelCandidate {
  id: string
  vram: number
  isQ4F16: boolean
  rank: number
}

/**
 * AI 模型信息（用于 UI 显示）
 */
export interface ModelInfo {
  id: string
  vendor: string
  size?: string
  params?: string
  quantization?: string
  vram?: number
  contextWindow?: number
  series?: string
}

/**
 * AI 请求参数
 * 注意：这是一个扩展接口，实际使用时可能需要转换为 WebLLM 的请求格式
 */
export interface AIRequestParams {
  messages: Array<{ role: string; content: string }>
  temperature: number
  top_p: number
  max_tokens: number
  context_window?: number
  presence_penalty?: number
  frequency_penalty?: number
  response_format?: { type: string }
  seed?: number
  stream?: boolean
  stream_options?: { include_usage?: boolean }
  [key: string]: unknown // 允许其他属性
}

/**
 * 谐音识别结果项
 */
export interface HomophoneItem {
  original: string
  guess: string[]
  confidence: number
  position?: number
}
