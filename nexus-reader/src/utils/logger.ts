/**
 * Unified logging utility
 *
 * Provides consistent logging across the application with different levels
 * and structured logging support.
 */

export interface LogContext {
  component?: string
  operation?: string
  userId?: string
  sessionId?: string
  [key: string]: any
}

class Logger {
  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`
  }

  debug(message: string, context?: LogContext): void {
    if (import.meta.env.DEV) {
      console.debug(this.formatMessage('debug', message, context))
    }
  }

  info(message: string, context?: LogContext): void {
    console.info(this.formatMessage('info', message, context))
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context))
  }

  error(message: string, context?: LogContext): void {
    console.error(this.formatMessage('error', message, context))
  }

  // Legacy methods for backward compatibility
  log = this.info
}

export const logger = new Logger()

// Export default for convenience
export default logger