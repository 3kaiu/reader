/**
 * AI 相关常量
 */

// VRAM 限制（7GB = 7000MB，允许 3B 与 7B/8B Q4 端侧运行）
export const AI_MAX_VRAM_MB = 7000

// 默认上下文窗口
export const AI_DEFAULT_CONTEXT_WINDOW = 4096

// 默认温度
export const AI_DEFAULT_TEMPERATURE = 0.7

// 默认 TopP
export const AI_DEFAULT_TOP_P = 0.9

// 默认最大 Token 数
export const AI_DEFAULT_MAX_TOKENS = 2048

// 默认 Presence Penalty
export const AI_DEFAULT_PRESENCE_PENALTY = 0.0

// 默认 Frequency Penalty
export const AI_DEFAULT_FREQUENCY_PENALTY = 0.0

// 推荐模型参数量范围（B = Billion）
export const AI_RECOMMENDED_PARAM_RANGES = ['1B', '1.5B', '2B', '3B', '7B', '8B'] as const

// 推荐的量化格式
export const AI_RECOMMENDED_QUANTIZATION = 'Q4' as const
