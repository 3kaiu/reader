/**
 * API 相关常量
 */

// 请求缓存 TTL（5分钟）
export const API_CACHE_TTL = 5 * 60 * 1000

// 请求超时时间（5分钟）
export const API_TIMEOUT = 5 * 60 * 1000

// 重试次数
export const API_MAX_RETRIES = 3

// 重试延迟倍数（指数退避）
export const API_RETRY_DELAY_MULTIPLIER = 1000
