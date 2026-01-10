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
  name: string
  fullName: string
  vendor: string
  size: string
  params: string
  quantization: string
  description: string
  recommended: boolean
  vram?: number
  contextWindow: number
  series: string
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

/**
 * 黑话/行话识别结果项
 */
export interface SlangItem {
  term: string           // 原文术语
  meaning: string        // 通俗解释
  category: 'internet' | 'novel' | 'gaming' | 'culture' | 'other'
}

/**
 * 梗/典故识别结果项
 */
export interface MemeItem {
  reference: string      // 梗/典故原文
  origin: string         // 出处
  explanation: string    // 解释
}

/**
 * 角色图谱节点
 */
export interface CharacterNode {
  name: string
  role: 'protagonist' | 'antagonist' | 'supporting' | 'mentioned'
  description: string
}

/**
 * 角色图谱边（关系）
 */
export interface CharacterEdge {
  from: string
  to: string
  relation: string
}

/**
 * 角色图谱数据
 */
export interface CharacterGraph {
  nodes: CharacterNode[]
  edges: CharacterEdge[]
}
