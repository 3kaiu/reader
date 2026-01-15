/**
 * 统一日志工具
 * 开发环境输出日志，生产环境可集成错误追踪服务
 * 支持通过环境变量控制日志级别
 */
const isDev = import.meta.env.DEV
const isProd = import.meta.env.PROD

// 从环境变量读取日志级别，默认：开发环境=debug，生产环境=error
const LOG_LEVEL = (() => {
  const envLevel = import.meta.env.VITE_LOG_LEVEL?.toLowerCase()
  if (envLevel === 'error' || envLevel === 'warn' || envLevel === 'info' || envLevel === 'debug') {
    return envLevel
  }
  return isDev ? 'debug' : 'error'
})()

// 日志级别优先级
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

const currentLevel = LOG_LEVELS[LOG_LEVEL as keyof typeof LOG_LEVELS] ?? LOG_LEVELS.error

function shouldLog(level: keyof typeof LOG_LEVELS): boolean {
  return LOG_LEVELS[level] <= currentLevel
}

export interface LogContext {
  [key: string]: unknown
}

export const logger = {
  /**
   * 错误日志
   * @param message 错误消息
   * @param error 错误对象（可选）
   * @param context 上下文信息（可选）
   */
  error: (message: string, error?: Error, context?: LogContext) => {
    if (shouldLog('error')) {
      if (isDev) {
        console.error(`[Error] ${message}`, error, context)
      } else {
        // 生产环境：只记录关键错误
        // 可以发送到错误追踪服务（如 Sentry）
        // 示例：
        // if (window.Sentry) {
        //   window.Sentry.captureException(error || new Error(message), {
        //     extra: context,
        //   })
        // }
      }
    }
  },

  /**
   * 警告日志
   * @param message 警告消息
   * @param context 上下文信息（可选）
   */
  warn: (message: string, context?: LogContext) => {
    if (shouldLog('warn')) {
      if (isDev) {
        console.warn(`[Warn] ${message}`, context)
      }
      // 生产环境：警告通常不输出，除非配置了 warn 级别
    }
  },

  /**
   * 信息日志
   * @param message 信息消息
   * @param context 上下文信息（可选）
   */
  info: (message: string, context?: LogContext) => {
    if (shouldLog('info')) {
      if (isDev) {
        console.info(`[Info] ${message}`, context)
      }
      // 生产环境：信息日志通常不输出
    }
  },

  /**
   * 调试日志
   * @param message 调试消息
   * @param context 上下文信息（可选）
   */
  debug: (message: string, context?: LogContext) => {
    if (shouldLog('debug')) {
      if (isDev) {
        console.debug(`[Debug] ${message}`, context)
      }
      // 生产环境：调试日志不输出
    }
  },
}

export default logger
