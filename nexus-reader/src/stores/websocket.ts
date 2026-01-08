import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useToast } from '@/components/ui/toast/use-toast'
import type { WSMessage, SearchState } from '@/types/websocket'

export const useWebSocketStore = defineStore('websocket', () => {
  const isConnected = ref(false)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 5
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let pongTimer: ReturnType<typeof setTimeout> | null = null
  const HEARTBEAT_INTERVAL = 30000 // 30 seconds
  const PONG_TIMEOUT = 10000 // 10 seconds to receive pong
  const { toast } = useToast()

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (pongTimer) {
      clearTimeout(pongTimer)
      pongTimer = null
    }
  }

  const startHeartbeat = () => {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }))
        // Set timeout waiting for pong
        pongTimer = setTimeout(() => {
          console.warn('WebSocket: pong timeout, reconnecting...')
          socket?.close()
        }, PONG_TIMEOUT)
      }
    }, HEARTBEAT_INTERVAL)
  }

  const connect = () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    // Use proxy path /ws/search
    const wsUrl = `${protocol}//${host}/ws/search`

    console.log('Connecting to WebSocket:', wsUrl)

    socket = new WebSocket(wsUrl)

    socket.onopen = () => {
      console.log('WebSocket connected')
      isConnected.value = true
      reconnectAttempts.value = 0
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      startHeartbeat()
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleMessage(data)
      } catch (e) {
        console.error('Failed to parse WS message:', event.data)
      }
    }

    socket.onclose = () => {
      console.log('WebSocket closed')
      isConnected.value = false
      socket = null
      stopHeartbeat()
      attemptReconnect()
    }

    socket.onerror = (error) => {
      console.error('WebSocket error:', error)
      socket?.close()
    }
  }

  const attemptReconnect = () => {
    if (reconnectAttempts.value < maxReconnectAttempts) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000)
      console.log(`Reconnecting in ${delay}ms... (Attempt ${reconnectAttempts.value + 1})`)
      reconnectTimer = setTimeout(() => {
        reconnectAttempts.value++
        connect()
      }, delay)
    } else {
      console.error('Max reconnect attempts reached')
      toast({
        title: "连接断开",
        description: "无法连接到服务器实时推送服务，请刷新页面重试。",
        variant: "destructive"
      })
    }
  }

  // State for UI to consume
  const syncLogs = ref<string[]>([])
  const lastMessage = ref<WSMessage | null>(null)

  // Search State
  const searchState = ref<SearchState>({
    isSearching: false,
    results: [],
    progress: { current: 0, total: 0 }
  })

  const send = (msg: Record<string, unknown>) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg))
    } else {
      console.warn('Socket not open, cannot send:', msg)
    }
  }

  const cancelSearch = () => {
    // Send cancel command to backend
    send({ type: 'cancel_search' })
    searchState.value.isSearching = false
  }

  const search = (keyword: string) => {
    if (!keyword.trim()) return

    // Cancel any ongoing search first
    if (searchState.value.isSearching) {
      send({ type: 'cancel_search' })
    }

    // Reset state
    searchState.value.isSearching = true
    searchState.value.results = []
    searchState.value.progress = { current: 0, total: 0 }

    // Send search command (Nexus-lite structure)
    send({
      keyword,
      sources: []
    })
  }

  const handleMessage = (msg: WSMessage) => {
    console.log('WS Message:', msg)
    lastMessage.value = msg

    switch (msg.type) {
      case 'sync_log':
        if (msg.payload?.message) {
          // Keep last 50 logs
          syncLogs.value.push(String(msg.payload.message))
          if (syncLogs.value.length > 50) syncLogs.value.shift()
        }
        break
      case 'sync_complete':
        toast({
          title: "同步完成",
          description: "书源订阅已自动更新完毕",
        })
        break
      case 'sys_notification':
        toast({
          title: msg.payload?.title ? String(msg.payload.title) : "系统通知",
          description: msg.payload?.message ? String(msg.payload.message) : "",
        })
        break
      // === Search Events (Nexus-lite) ===
      case 'result':
        if (msg.data) {
          searchState.value.results.push(msg.data as any)
        }
        break
      case 'done':
        searchState.value.isSearching = false
        break
      case 'error':
        if (msg.message) {
          toast({
            title: "搜索错误",
            description: msg.message,
            variant: "destructive"
          })
        }
        break
      case 'pong':
        // Clear pong timeout when we receive pong
        if (pongTimer) {
          clearTimeout(pongTimer)
          pongTimer = null
        }
        break
    }
  }

  const clearLogs = () => {
    syncLogs.value = []
  }

  const disconnect = () => {
    stopHeartbeat()
    if (socket) {
      socket.close()
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }
  }

  // 可见性感知：移动端锁屏后恢复时立即检查连接状态
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // 页面变为可见时，检查 WebSocket 连接状态
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          console.log('Page became visible, reconnecting WebSocket...')
          reconnectAttempts.value = 0 // 重置重连计数
          connect()
        } else {
          // 连接正常，发送心跳验活
          send({ type: 'ping' })
        }
      }
    })
  }

  return {
    isConnected,
    syncLogs,
    lastMessage,
    searchState, // Exported
    connect,
    disconnect,
    clearLogs,
    search,     // Exported
    cancelSearch, // Exported
    send
  }
})
