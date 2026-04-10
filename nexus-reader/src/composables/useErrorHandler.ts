/**
 * 错误处理组合函数
 */
import { ref, readonly } from 'vue'
import { useMessage } from './useMessage'
import { errorHandler } from '@/utils/error-handler'
import { processError, type ErrorContext } from '@/utils/errors'

type HandlerContext = ErrorContext | string | undefined

interface CapturedErrorRecord {
  id: string
  error: unknown
  context?: HandlerContext
  timestamp: number
}

export function useErrorHandler() {
  const { error: showError, warning: showWarning } = useMessage()
  const errors = ref<CapturedErrorRecord[]>([])

  const formatErrorMessage = (error: unknown, fallbackMessage?: string) => {
    const info = processError(error)
    return info.userMessage || fallbackMessage || info.message || '操作失败，请重试'
  }

  const handleError = (error: unknown, context?: HandlerContext, showToast = true) => {
    const timestamp = Date.now()
    const errorId = `${timestamp}-${errors.value.length}`
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' && error.trim() ? error : 'Unknown error')
    const userMessage = formatErrorMessage(error)

    const errorInfo: CapturedErrorRecord = {
      id: errorId,
      error,
      context,
      timestamp,
    }

    errors.value.push(errorInfo)

    if (showToast) {
      showError(userMessage)
    }

    // 使用统一的错误处理器
    errorHandler.handle(
      normalizedError,
      typeof context === 'string' ? { message: context } : context
    )

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

  const handleApiError = (
    response: { isSuccess?: boolean; errorMsg?: string },
    fallbackMessage?: string,
    showToast = true
  ) => {
    if (response?.isSuccess) {
      return ''
    }

    const message = response.errorMsg || fallbackMessage || '请求失败'
    return handleError(new Error(message), { source: 'api-response', response }, showToast)
  }

  const handlePromiseError = (error: unknown, fallbackMessage?: string, showToast = true) => {
    const wrappedError =
      error instanceof Error ? error : new Error(fallbackMessage || String(error))
    return handleError(wrappedError, { source: 'promise', fallbackMessage }, showToast)
  }

  const handleWarning = (message: string, showToast = true) => {
    if (!showToast) {
      return ''
    }

    return showWarning(message)
  }

  return {
    errors: readonly(errors),
    handleError,
    handleApiError,
    handlePromiseError,
    handleWarning,
    formatErrorMessage,
    clearError,
    clearAllErrors,
  }
}
