/**
 * Unified Logger for Cloudflare Workers
 * 
 * Provides environment-aware logging that can be disabled in production.
 * Usage:
 *   const logger = createLogger(env);
 *   logger.debug('Debug info');  // Only logs if DEBUG=true
 *   logger.error('Error info');  // Always logs
 */

export interface LoggerEnv {
  DEBUG?: string;
  ENVIRONMENT?: string;
}

export interface Logger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

/**
 * Create a logger instance based on environment configuration
 */
export function createLogger(env: LoggerEnv): Logger {
  const isDebug = env.DEBUG === 'true' || env.ENVIRONMENT === 'development';
  const isProd = env.ENVIRONMENT === 'production';

  return {
    debug: (message: string, ...args: any[]) => {
      if (isDebug) {
        console.log(`[DEBUG] ${message}`, ...args);
      }
    },

    info: (message: string, ...args: any[]) => {
      if (!isProd || isDebug) {
        console.log(`[INFO] ${message}`, ...args);
      }
    },

    warn: (message: string, ...args: any[]) => {
      console.warn(`[WARN] ${message}`, ...args);
    },

    error: (message: string, ...args: any[]) => {
      console.error(`[ERROR] ${message}`, ...args);
    },
  };
}

/**
 * No-op logger for production environments where logging is disabled
 */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: (message: string, ...args: any[]) => {
    // Only errors are logged in production
    console.error(`[ERROR] ${message}`, ...args);
  },
};
