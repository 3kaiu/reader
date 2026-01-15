/**
 * 统一错误处理 composable
 * 委托给核心 errorHandler 处理，只负责 UI 集成
 */
import { useMessage } from "./useMessage"
import { processError, type ErrorContext } from "../utils/errorHandler"

/**
 * 统一错误处理 composable
 */
export function useErrorHandler() {
  const { error: showError, warning: showWarning } = useMessage()

  /**
   * 处理错误并显示错误提示
   * 
   * 统一的错误处理入口，会自动：
   * - 格式化错误消息
   * - 显示用户友好的提示
   * - 记录错误日志
   * 
   * @param error - 错误对象或错误消息
   * @param fallbackMessage - 备用错误消息（如果无法从错误中提取消息）
   * @param showToast - 是否显示 toast 提示（默认 true）
   * @returns 格式化后的错误消息
   * @example
   * ```typescript
   * try {
   *   await someApiCall()
   * } catch (error) {
   *   handleError(error, '操作失败')
   * }
   * ```
   */
  function handleError(
    error: Error | string | unknown,
    fallbackMessage?: string,
    showToast = true
  ): string {
    // 委托给核心处理器
    const context: ErrorContext | undefined = fallbackMessage ? { fallbackMessage } : undefined
    const errorInfo = processError(error, context)
    
    // 显示 toast（如果需要）
    if (showToast) {
      showError(errorInfo.userMessage)
    }
    
    return errorInfo.userMessage
  }

  /**
   * 处理 API 错误响应
   * 
   * 专门用于处理 API 返回的错误响应
   * 
   * @param response - API 响应对象，包含 isSuccess 和 errorMsg 字段
   * @param fallbackMessage - 备用错误消息
   * @returns 错误消息（如果没有错误则返回空字符串）
   * @example
   * ```typescript
   * const res = await api.getData()
   * if (!res.isSuccess) {
   *   handleApiError(res, '获取数据失败')
   * }
   * ```
   */
  function handleApiError(
    response: { isSuccess?: boolean; errorMsg?: string; data?: unknown },
    fallbackMessage = "操作失败"
  ): string {
    if (!response.isSuccess) {
      return handleError(
        response.errorMsg || response.data || fallbackMessage,
        fallbackMessage
      )
    }
    return ""
  }

  /**
   * 处理 Promise 错误（用于 async/await 的 catch 块）
   * 
   * 便捷方法，用于 Promise 的 catch 块
   * 
   * @param error - 错误对象
   * @param fallbackMessage - 备用错误消息
   * @returns 格式化后的错误消息
   * @example
   * ```typescript
   * someAsyncFunction().catch(e => handlePromiseError(e, '操作失败'))
   * ```
   */
  function handlePromiseError(
    error: Error | string | unknown,
    fallbackMessage = "操作失败"
  ): string {
    return handleError(error, fallbackMessage)
  }

  /**
   * 显示警告信息
   * @param message - 警告消息
   */
  function handleWarning(message: string) {
    showWarning(message)
  }

  /**
   * 格式化错误消息（向后兼容）
   * @param error - 错误对象、错误消息或其他类型
   * @returns 格式化后的错误消息
   */
  function formatErrorMessage(error: Error | string | unknown): string {
    const errorInfo = processError(error)
    return errorInfo.userMessage
  }

  return {
    handleError,
    handleApiError,
    handlePromiseError,
    handleWarning,
    formatErrorMessage,
  }
}
