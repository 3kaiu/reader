/**
 * 消息提示组合函数
 */
import { ref, readonly } from 'vue'

interface MessageOptions {
  duration?: number
  type?: 'info' | 'success' | 'warning' | 'error'
}

export function useMessage() {
  const messages = ref<
    Array<{
      id: string
      content: string
      type: 'info' | 'success' | 'warning' | 'error'
      duration: number
    }>
  >([])

  const showMessage = (content: string, options: MessageOptions = {}) => {
    const { duration = 3000, type = 'info' } = options

    const message = {
      id: Date.now().toString(),
      content,
      type,
      duration,
    }

    messages.value.push(message)

    // 自动移除
    if (duration > 0) {
      setTimeout(() => {
        removeMessage(message.id)
      }, duration)
    }

    return message.id
  }

  const removeMessage = (id: string) => {
    const index = messages.value.findIndex(msg => msg.id === id)
    if (index >= 0) {
      messages.value.splice(index, 1)
    }
  }

  const clearMessages = () => {
    messages.value = []
  }

  return {
    messages: readonly(messages),
    showMessage,
    removeMessage,
    clearMessages,

    // 便捷方法
    info: (content: string, options?: Omit<MessageOptions, 'type'>) =>
      showMessage(content, { ...options, type: 'info' }),

    success: (content: string, options?: Omit<MessageOptions, 'type'>) =>
      showMessage(content, { ...options, type: 'success' }),

    warning: (content: string, options?: Omit<MessageOptions, 'type'>) =>
      showMessage(content, { ...options, type: 'warning' }),

    error: (content: string, options?: Omit<MessageOptions, 'type'>) =>
      showMessage(content, { ...options, type: 'error' }),
  }
}
