/**
 * 统一错误处理 composable
 * 提供统一的错误处理和格式化功能
 */
import { useMessage } from "./useMessage";

export interface ErrorInfo {
  message: string;
  code?: string;
  details?: unknown;
}

// 错误消息映射表 - 将技术错误转换为用户友好的提示
const ERROR_MESSAGE_MAP: Record<string, string> = {
  // 网络错误
  NetworkException: "网络连接失败，请检查网络后重试",
  TimeoutException: "请求超时，请稍后重试",
  "Network request failed": "网络请求失败，请检查网络连接",
  "Failed to fetch": "无法连接到服务器，请检查网络",

  // 业务错误
  NEED_LOGIN: "请先登录",
  Unauthorized: "登录已过期，请重新登录",
  Forbidden: "没有权限执行此操作",
  NotFound: "请求的资源不存在",

  // 书源相关错误
  TocEmptyException: "目录加载失败，该书源可能已失效，请换源",
  SourceException: "书源解析失败，请换一个书源",
  ContentEmptyException: "章节内容为空，请换源重试",
  ConcurrentException: "请求过于频繁，请稍后重试",
  NullPointerException: "数据解析失败，请换一个书源",
  SSLException: "安全连接失败，请换一个书源",
  UnknownHostException: "无法连接书源服务器，请换源",

  // 通用错误
  UnknownError: "发生未知错误，请稍后重试",
  ServerError: "服务器错误，请稍后重试",
  BadRequest: "请求参数错误",
};

/**
 * 格式化错误消息
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
   * @param error - 错误对象或错误消息
   * @param fallbackMessage - 备用错误消息（如果无法从错误中提取消息）
   * @param showToast - 是否显示 toast 提示（默认 true）
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

    // 开发环境下输出详细错误信息到控制台
    if (import.meta.env.DEV) {
      console.error("[ErrorHandler]", error);
    }

    return message;
  }

  /**
   * 处理 API 错误响应
   * @param response - API 响应对象
   * @param fallbackMessage - 备用错误消息
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
   * @param error - 错误对象
   * @param fallbackMessage - 备用错误消息
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
