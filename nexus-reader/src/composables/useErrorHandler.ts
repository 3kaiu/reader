/**
 * 错误处理组合函数
 */
import { ref, readonly } from 'vue'
import { errorHandler } from '@/utils/unified-utils'

export function useErrorHandler() {
  const errors = ref<Array<{
    id: string
    error: any
    context?: any
    timestamp: number
  }>>([])

  const handleError = (error: any, context?: any, _silent?: boolean) => {
    const errorId = Date.now().toString()

    const errorInfo = {
      id: errorId,
      error,
      context,
      timestamp: Date.now()
    }

    errors.value.push(errorInfo)

    // 使用统一的错误处理器
    errorHandler.handle(error, context)

    return errorId
  }

  const clearError = (id: string) => {
    const index = errors.value.findIndex(err => err.id === id)
    if (index >= 0) {
      errors.value.splice(index, 1)
    }
  }

  const clearAllErrors = () => {
    errors.value = []
  }

  return {
    errors: readonly(errors),
    handleError,
    clearError,
    clearAllErrors
  }
}