/**
 * 核心工具函数
 *
 * 聚合基础的工具函数：
 * - 类型检查和转换
 * - 字符串处理
 * - 数组和对象操作
 * - 时间和日期处理
 * - 数学计算
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ===== 类型检查 =====

export const isString = (value: unknown): value is string => typeof value === 'string'
export const isNumber = (value: unknown): value is number => typeof value === 'number' && !isNaN(value)
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
export const isArray = (value: unknown): value is unknown[] => Array.isArray(value)
export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !isArray(value)
export const isFunction = (value: unknown): value is Function => typeof value === 'function'
export const isUndefined = (value: unknown): value is undefined => value === undefined
export const isNull = (value: unknown): value is null => value === null
export const isNil = (value: unknown): value is null | undefined => isNull(value) || isUndefined(value)

// ===== 类型转换 =====

export const toString = (value: unknown): string => {
  if (isString(value)) return value
  if (isNumber(value) || isBoolean(value)) return String(value)
  if (isArray(value) || isObject(value)) return JSON.stringify(value)
  return String(value)
}

export const toNumber = (value: unknown): number => {
  if (isNumber(value)) return value
  if (isString(value)) {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? 0 : parsed
  }
  return 0
}

export const toBoolean = (value: unknown): boolean => {
  if (isBoolean(value)) return value
  if (isString(value)) return value.toLowerCase() === 'true' || value === '1'
  if (isNumber(value)) return value !== 0
  return Boolean(value)
}

// ===== 字符串处理 =====

export const capitalize = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()

export const camelCase = (str: string): string =>
  str.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')

export const kebabCase = (str: string): string =>
  str.replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()

export const snakeCase = (str: string): string =>
  str.replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()

export const truncate = (str: string, length: number, suffix = '...'): string =>
  str.length <= length ? str : str.slice(0, length - suffix.length) + suffix

export const slugify = (str: string): string =>
  str.toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

// ===== 数组操作 =====

export const unique = <T>(arr: T[]): T[] => [...new Set(arr)]

export const uniqueBy = <T, K>(arr: T[], keyFn: (item: T) => K): T[] => {
  const seen = new Set<K>()
  return arr.filter(item => {
    const key = keyFn(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const groupBy = <T, K extends string | number | symbol>(
  arr: T[],
  keyFn: (item: T) => K
): Record<K, T[]> => {
  return arr.reduce((groups, item) => {
    const key = keyFn(item)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
    return groups
  }, {} as Record<K, T[]>)
}

export const sortBy = <T>(arr: T[], keyFn: (item: T) => unknown): T[] => {
  return [...arr].sort((a, b) => {
    const aVal = keyFn(a)
    const bVal = keyFn(b)

    if (aVal < bVal) return -1
    if (aVal > bVal) return 1
    return 0
  })
}

export const partition = <T>(
  arr: T[],
  predicate: (item: T) => boolean
): [T[], T[]] => {
  const truthy: T[] = []
  const falsy: T[] = []

  arr.forEach(item => {
    if (predicate(item)) {
      truthy.push(item)
    } else {
      falsy.push(item)
    }
  })

  return [truthy, falsy]
}

// ===== 对象操作 =====

export const pick = <T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> => {
  const result = {} as Pick<T, K>
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key]
    }
  })
  return result
}

export const omit = <T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> => {
  const result = { ...obj }
  keys.forEach(key => delete result[key])
  return result
}

export const merge = <T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T => {
  return sources.reduce((acc, source) => ({ ...acc, ...source }), target)
}

export const deepMerge = <T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T => {
  const result = { ...target }

  Object.keys(source).forEach(key => {
    const targetValue = result[key]
    const sourceValue = source[key]

    if (isObject(targetValue) && isObject(sourceValue)) {
      result[key] = deepMerge(targetValue, sourceValue)
    } else {
      result[key] = sourceValue as T[Extract<keyof T, string>]
    }
  })

  return result
}

// ===== 时间和日期 =====

export const formatDate = (date: Date, format = 'YYYY-MM-DD'): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

export const formatRelativeTime = (date: Date): string => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 30) return `${diffDays}天前`

  return formatDate(date)
}

export const parseDate = (dateString: string): Date | null => {
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? null : date
}

// ===== 数学计算 =====

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

export const lerp = (start: number, end: number, t: number): number =>
  start + (end - start) * clamp(t, 0, 1)

export const mapRange = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number => {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
}

export const roundTo = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// ===== 随机数生成 =====

export const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min

export const randomFloat = (min: number, max: number): number =>
  Math.random() * (max - min) + min

export const randomChoice = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)]

export const shuffle = <T>(arr: T[]): T[] => {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// ===== CSS类名处理 =====

export const cn = (...inputs: ClassValue[]): string => {
  return twMerge(clsx(inputs))
}

// ===== 异步工具 =====

export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

export const timeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), ms)
    ),
  ])

export const retry = async <T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  delay: number = 1000
): Promise<T> => {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === attempts - 1) throw error
      await sleep(delay * Math.pow(2, i)) // 指数退避
    }
  }
  throw new Error('Retry failed')
}

// ===== 防抖和节流 =====

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle = false

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

// ===== URL处理 =====

export const buildUrl = (base: string, params: Record<string, string | number | boolean>): string => {
  const url = new URL(base, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })
  return url.toString()
}

export const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

// ===== 本地存储 =====

export const storage = {
  get: <T>(key: string, defaultValue?: T): T | null => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue || null
    } catch {
      return defaultValue || null
    }
  },

  set: <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error('Storage set error:', error)
    }
  },

  remove: (key: string): void => {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error('Storage remove error:', error)
    }
  },

  clear: (): void => {
    try {
      localStorage.clear()
    } catch (error) {
      console.error('Storage clear error:', error)
    }
  },
}

// ===== 设备检测 =====

export const device = {
  isMobile: (): boolean => {
    if (typeof window === 'undefined') return false
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  },

  isTablet: (): boolean => {
    if (typeof window === 'undefined') return false
    return /iPad|Android(?=.*\bMobile\b)(?!.*\bPhone\b)/i.test(navigator.userAgent)
  },

  isDesktop: (): boolean => {
    if (typeof window === 'undefined') return false
    return !device.isMobile() && !device.isTablet()
  },

  isTouchDevice: (): boolean => {
    if (typeof window === 'undefined') return false
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  },

  screenSize: (): { width: number; height: number } => {
    if (typeof window === 'undefined') return { width: 0, height: 0 }
    return {
      width: window.innerWidth || document.documentElement.clientWidth,
      height: window.innerHeight || document.documentElement.clientHeight,
    }
  },
}

// ===== 性能监控 =====

export const performance = {
  measure: (name: string, fn: () => void): number => {
    const start = performance.now()
    fn()
    const end = performance.now()
    return end - start
  },

  measureAsync: async (name: string, fn: () => Promise<void>): Promise<number> => {
    const start = performance.now()
    await fn()
    const end = performance.now()
    return end - start
  },
}