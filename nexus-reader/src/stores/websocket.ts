import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useToast } from '@/components/ui/toast/use-toast'
import type { WSMessage, SearchState } from '@/types/websocket'

export const useWebSocketStore = defineStore('websocket', () => {
  const isConnected = ref(false)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 5
  let socket: WebSocket | null = null
  let sseAbortController: AbortController | null = null
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
        pongTimer = setTimeout(() => {
          console.warn('WebSocket: pong timeout, reconnecting...')
          socket?.close()
        }, PONG_TIMEOUT)
      }
    }, HEARTBEAT_INTERVAL)
  }

  const connect = () => {
    // 生产环境使用 SSE，不需要 WebSocket 连接
    if (import.meta.env.PROD) {
      console.info('Production mode: Using SSE for search instead of WebSocket')
      isConnected.value = true // 标记为已连接，因为 SSE 是按需连接的
      return
    }

    // 开发环境: WebSocket 连接
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws/search`

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
          const safeData = typeof event.data === 'string' ? event.data.replace(/[\r\n]/g, '') : 'non-string data'
          console.error('Failed to parse WS message:', safeData)
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
    } catch (e) {
      console.error('Failed to create WebSocket:', e)
    }
  }

  const attemptReconnect = () => {
    if (import.meta.env.PROD) return // 生产环境不需要重连

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
    // 取消 SSE 请求
    if (sseAbortController) {
      sseAbortController.abort()
      sseAbortController = null
    }
    // 取消 WebSocket 搜索
    send({ type: 'cancel_search' })
    searchState.value.isSearching = false
  }

  /**
   * SSE 流式搜索 (生产环境)
   */
  const searchWithSSE = async (keyword: string) => {
    const apiUrl = import.meta.env.VITE_API_URL || ''
    if (!apiUrl) {
      toast({
        title: "配置错误",
        description: "API URL 未配置",
        variant: "destructive"
      })
      return
    }

    // 取消之前的搜索
    if (sseAbortController) {
      sseAbortController.abort()
    }
    sseAbortController = new AbortController()

    searchState.value.isSearching = true
    searchState.value.results = []
    searchState.value.progress = { current: 0, total: 0 }

    try {
      // 获取认证 token
      const token = localStorage.getItem('nexus_auth_token')
      
      // 使用 fetch + ReadableStream 来处理 SSE (因为 EventSource 不支持 POST 和自定义 headers)
      const response = await fetch(`${apiUrl}/search/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ keyword, sources: [] }),
        signal: sseAbortController.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        
        // 解析 SSE 事件
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留不完整的行

        let currentEvent = ''
        let currentData = ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            currentData = line.slice(5).trim()
          } else if (line === '' && currentData) {
            // 空行表示事件结束
            try {
              const parsed = JSON.parse(currentData)
              handleSSEEvent(currentEvent, parsed)
            } catch (e) {
              console.error('Failed to parse SSE data:', currentData)
            }
            currentEvent = ''
            currentData = ''
          }
        }
      }
    } catch (e) {
      // 忽略取消错误
      if (e instanceof Error && e.name === 'AbortError') {
        console.log('SSE search cancelled')
        return
      }
      console.error('SSE search error:', e)
      toast({
        title: "搜索失败",
        description: e instanceof Error ? e.message : '未知错误',
        variant: "destructive"
      })
    } finally {
      searchState.value.isSearching = false
      sseAbortController = null
    }
  }

  /**
   * 处理 SSE 事件
   */
  const handleSSEEvent = (event: string, data: any) => {
    switch (event) {
      case 'result':
        if (data.data) {
          searchState.value.results.push(data.data)
          searchState.value.progress.current = searchState.value.results.length
        }
        break
      case 'error':
        console.warn('Search source error:', data.source_id, data.error)
        break
      case 'done':
        searchState.value.isSearching = false
        searchState.value.progress.total = data.total || searchState.value.results.length
        break
    }
  }

  const search = (keyword: string) => {
    if (!keyword.trim()) return

    // 取消正在进行的搜索
    if (searchState.value.isSearching) {
      cancelSearch()
    }

    // 生产环境使用 SSE
    if (import.meta.env.PROD) {
      searchWithSSE(keyword)
      return
    }

    // 开发环境使用 WebSocket
    searchState.value.isSearching = true
    searchState.value.results = []
    searchState.value.progress = { current: 0, total: 0 }

    send({
      keyword,
      sources: []
    })
  }

  const handleMessage = (msg: WSMessage) => {
    const safeMsg = JSON.stringify(msg).replace(/[\r\n]/g, '')
    console.log('WS Message:', safeMsg)
    lastMessage.value = msg

    switch (msg.type) {
      case 'sync_log':
        if (msg.payload?.message) {
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
    if (sseAbortController) {
      sseAbortController.abort()
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }
  }

  // 可见性感知
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!import.meta.env.PROD && (!socket || socket.readyState !== WebSocket.OPEN)) {
          console.log('Page became visible, reconnecting WebSocket...')
          reconnectAttempts.value = 0
          connect()
        }
      }
    })
  }

  return {
    isConnected,
    syncLogs,
    lastMessage,
    searchState,
    connect,
    disconnect,
    clearLogs,
    search,
    cancelSearch,
    send
  }
})
