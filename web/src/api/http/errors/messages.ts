const ERROR_MESSAGE_MAP: Record<string, string> = {
  'Network request failed': '网络连接失败，请检查网络后重试',
  'Request timeout': '请求超时，请稍后重试',
  'Failed to fetch': '无法连接到服务器，请检查网络',
  'Source not found': '书源不存在，请选择其他书源',
  'Book not found': '书籍不存在或已被删除',
  'Chapter not found': '章节不存在',
  'Rule mismatch': '内容解析失败，请尝试其他书源',
  'Internal server error': '服务器内部错误，请稍后重试',
  'Service temporarily unavailable': '服务暂时不可用，请稍后重试',
  'Bad request': '请求参数错误，请重试',
  Unauthorized: '登录已过期，请重新登录',
  Forbidden: '没有权限访问此资源',
}

export function translateErrorMessage(errorMsg: string): string {
  if (ERROR_MESSAGE_MAP[errorMsg]) {
    return ERROR_MESSAGE_MAP[errorMsg]
  }

  for (const [pattern, friendlyMsg] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (errorMsg.toLowerCase().includes(pattern.toLowerCase())) {
      return friendlyMsg
    }
  }

  return errorMsg
}
