/**
 * 统一日志工具
 * 开发环境输出日志，生产环境可集成错误追踪服务
 */
const isDev = import.meta.env.DEV

export interface LogContext {
  [key: string]: any
}

export const logger = {
  /**
   * 错误日志
   * @param message 错误消息
   * @param error 错误对象（可选）
   * @param context 上下文信息（可选）
   */
  error: (message: string, error?: Error, context?: LogContext) => {
    if (isDev) {
      console.error(`[Error] ${message}`, error, context)
    } else {
      // 生产环境：可以发送到错误追踪服务（如 Sentry）
      // 示例：
      // if (window.Sentry) {
      //   window.Sentry.captureException(error || new Error(message), {
      //     extra: context,
      //   })
      // }
    }
  },

  /**
   * 警告日志
   * @param message 警告消息
   * @param context 上下文信息（可选）
   */
  warn: (message: string, context?: LogContext) => {
    if (isDev) {
      console.warn(`[Warn] ${message}`, context)
    }
  },

  /**
   * 信息日志
   * @param message 信息消息
   * @param context 上下文信息（可选）
   */
  info: (message: string, context?: LogContext) => {
    if (isDev) {
      console.info(`[Info] ${message}`, context)
    }
  },

  /**
   * 调试日志
   * @param message 调试消息
   * @param context 上下文信息（可选）
   */
  debug: (message: string, context?: LogContext) => {
    if (isDev) {
      console.debug(`[Debug] ${message}`, context)
    }
  },
}

export default logger
