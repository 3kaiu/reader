/**
 * 统一错误处理 composable
 * 提供统一的错误处理和格式化功能
 */
import { useMessage } from "./useMessage";
import { logger } from "../utils/logger";

export interface ErrorInfo {
  message: string;
  code?: string;
  details?: unknown;
}

// 错误消息映射表 - 将技术错误转换为用户友好的提示
const ERROR_MESSAGE_MAP: Record<string, string> = {
  // 网络与连接错误
  NetworkException: "网络连接失败，请检查网络后重试",
  TimeoutException: "请求超时，请重试或检查书源连通性",
  "Network request failed": "网络异常，请确认服务器与书源均可连接",
  "Failed to fetch": "无法连接到服务器，请检查网络或代理设置",
  "ERR_NAME_NOT_RESOLVED": "无法解析域名，请检查 DNS 或书源地址",
  "ERR_CONNECTION_REFUSED": "服务器拒绝连接，请检查服务是否在线",

  // 业务状态错误
  NEED_LOGIN: "请先登录 Nexus 账号",
  Unauthorized: "登录已失效，请重新登录以同步进度",
  Forbidden: "当前无权访问，请联系管理员或确认权限",
  NotFound: "请求的资源已丢失或不存在",

  // 书源/解析深度错误 (Nexus-Lite 特有)
  TocEmptyException: "目录为空或无法提取，书源解析规则可能已过期",
  SourceException: "书源规则匹配失败，请尝试刷新或切换引擎",
  ContentEmptyException: "正文提取失败，章节内容可能已被屏蔽或需要重新加载",
  ConcurrentException: "当前并发请求过多，书源已限制频率，请稍候",
  NullPointerException: "处理响应数据时发生空引用，请反馈书源异常",
  SSLException: "与书源建立安全连接失败（SSL 握手错误），请换源",
  UnknownHostException: "书源地址找不到（域名解析失败），请确认书源有效性",
  "Empty group name": "分组名称不能为空",
  "Book not found": "找不到该书籍的相关记录",

  // 通用错误
  UnknownError: "发生未知系统错误，请查看日志或重试",
  ServerError: "服务器内部异常，正在尝试自我恢复...",
  BadRequest: "请求指令有误，请刷新页面后重试",
};

/**
 * 格式化错误消息
 * 
 * 将各种类型的错误转换为用户友好的提示信息
 * - 字符串类型：直接返回
 * - Error 对象：提取 message 或 name
 * - 对象类型：尝试提取 message/error/errorMsg
 * - 其他类型：转为字符串
 * 
 * @param error - 错误对象、错误消息或其他类型
 * @returns 格式化后的错误消息
 * @example
 * ```typescript
 * formatErrorMessage(new Error('Network error')) // '网络连接失败，请检查网络后重试'
 * formatErrorMessage('TocEmptyException: 目录为空') // '目录加载失败，该书源可能已失效，请换源'
 * ```
 */
function formatErrorMessage(error: Error | string | unknown): string {
  if (!error) return "未知错误";

  let errorMessage = "";

  // 处理字符串类型的错误
  if (typeof error === "string") {
    errorMessage = error;
  }
  // 处理 Error 对象
  else if (error instanceof Error) {
    errorMessage = error.message || error.name || "未知错误";
  }
  // 处理对象类型的错误（包含 message 属性）
  else if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    errorMessage = String(
      err.message || err.error || err.errorMsg || "未知错误"
    );
  }
  // 其他类型转为字符串
  else {
    errorMessage = String(error);
  }

  // 检查错误消息映射表
  for (const [key, message] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (errorMessage.includes(key)) {
      return message;
    }
  }

  // 移除 Java 异常前缀，只保留冒号后的信息
  if (errorMessage.includes("Exception:")) {
    const parts = errorMessage.split(":");
    if (parts.length > 1) {
      const cleanMessage = parts.slice(1).join(":").trim();
      if (cleanMessage) return cleanMessage;
    }
  }

  // 如果是很长的技术性错误，简化显示
  if (
    errorMessage.length > 100 &&
    errorMessage.includes(".") &&
    errorMessage.includes("Exception")
  ) {
    return "操作失败，请稍后重试";
  }

  // 返回原始错误消息（如果为空则返回默认消息）
  return errorMessage || "未知错误";
}

/**
 * 统一错误处理 composable
 */
export function useErrorHandler() {
  const { error: showError, warning: showWarning } = useMessage();

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
    const message = formatErrorMessage(error) || fallbackMessage || "操作失败";

    if (showToast) {
      showError(message);
    }

    // 使用统一日志工具记录错误
    logger.error(
      '[ErrorHandler]',
      error instanceof Error ? error : new Error(String(error)),
      { context: fallbackMessage }
    )

    return message;
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
      );
    }
    return "";
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
    return handleError(error, fallbackMessage);
  }

  /**
   * 显示警告信息
   * @param message - 警告消息
   */
  function handleWarning(message: string) {
    showWarning(message);
  }

  return {
    handleError,
    handleApiError,
    handlePromiseError,
    handleWarning,
    formatErrorMessage,
  };
}
