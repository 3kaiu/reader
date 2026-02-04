/**
 * WebSocket连接状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { errorHandler, logger } from '@/utils/unified-utils'

interface WebSocketState {
  connected: boolean
  url: string | null
  reconnectAttempts: number
  lastMessage: any
  messageHistory: any[]
  connectionQuality: 'good' | 'fair' | 'poor' | 'disconnected'
}

export const useWebSocketStore = defineStore('websocket', () => {
  const state = ref<WebSocketState>({
    connected: false,
    url: null,
    reconnectAttempts: 0,
    lastMessage: null,
    messageHistory: [],
    connectionQuality: 'disconnected'
  })

  const ws = ref<WebSocket | null>(null)
  const reconnectTimer = ref<NodeJS.Timeout | null>(null)

  const isConnected = computed(() => state.value.connected)
  const connectionQuality = computed(() => state.value.connectionQuality)
  const messageCount = computed(() => state.value.messageHistory.length)

  const connect = async (url: string) => {
    try {
      if (ws.value && ws.value.readyState === WebSocket.OPEN) {
        logger.warn('WebSocket already connected')
      return
    }

      state.value.url = url
      state.value.reconnectAttempts = 0

      ws.value = new WebSocket(url)

      ws.value.onopen = () => {
        state.value.connected = true
        state.value.connectionQuality = 'good'
        state.value.reconnectAttempts = 0
        logger.info('WebSocket connected', { url })
      }

      ws.value.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          state.value.lastMessage = message
          state.value.messageHistory.push({
            timestamp: Date.now(),
            data: message
          })

          // 限制历史记录数量
          if (state.value.messageHistory.length > 100) {
            state.value.messageHistory = state.value.messageHistory.slice(-100)
          }

          logger.debug('WebSocket message received', { message })
        } catch (error) {
          logger.error('Failed to parse WebSocket message', { error, data: event.data })
        }
      }

      ws.value.onclose = () => {
        state.value.connected = false
        state.value.connectionQuality = 'disconnected'
        logger.info('WebSocket disconnected')

        // 自动重连
        scheduleReconnect()
      }

      ws.value.onerror = (error) => {
        state.value.connectionQuality = 'poor'
        errorHandler.handle(error, { component: 'websocket-store', operation: 'connection' })
      }

    } catch (error) {
      errorHandler.handle(error, { component: 'websocket-store', operation: 'connect' })
    }
  }

  const disconnect = () => {
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }

    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value)
      reconnectTimer.value = null
    }

    state.value.connected = false
    state.value.connectionQuality = 'disconnected'
    logger.info('WebSocket manually disconnected')
  }

  const sendMessage = (message: any) => {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      logger.error('WebSocket not connected, cannot send message')
      return false
    }

    try {
      const data = JSON.stringify(message)
      ws.value.send(data)
      logger.debug('WebSocket message sent', { message })
      return true
    } catch (error) {
      errorHandler.handle(error, { component: 'websocket-store', operation: 'sendMessage' })
      return false
    }
  }

  const scheduleReconnect = () => {
    if (state.value.reconnectAttempts >= 5) {
      logger.error('Max reconnection attempts reached')
      return
    }

    state.value.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, state.value.reconnectAttempts), 30000)

    reconnectTimer.value = setTimeout(() => {
      if (state.value.url && !state.value.connected) {
        logger.info(`Attempting to reconnect (${state.value.reconnectAttempts}/5)`)
        connect(state.value.url)
      }
    }, delay)
  }

  const clearHistory = () => {
    state.value.messageHistory = []
    logger.info('WebSocket message history cleared')
  }

  return {
    // State
    state: readonly(state),

    // Getters
    isConnected,
    connectionQuality,
    messageCount,

    // Actions
    connect,
    disconnect,
    sendMessage,
    clearHistory
  }
})