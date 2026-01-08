/**
 * 📡 BroadcastChannel Utility
 * 用于跨标签页同步状态 (阅读位置, AI 引擎状态, TTS 状态)
 */
import { logger } from './logger'

export type BroadcastType =
  | 'reading-progress'
  | 'ai-engine-status'
  | 'tts-event'
  | 'theme-change'

export interface BroadcastMessage {
  type: BroadcastType
  payload: any
  sourceTabId: string
}

const CHANNEL_NAME = 'nexus-reader-sync'
const TAB_ID = Math.random().toString(36).substring(2, 9)

class NexusBroadcast {
  private channel: BroadcastChannel | null = null
  private listeners: Map<BroadcastType, Set<(payload: any) => void>> = new Map()

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (event) => this.handleMessage(event.data)
    } else {
      logger.warn('BroadcastChannel 不受支持，跨标签页同步将失效')
    }
  }

  private handleMessage(data: BroadcastMessage) {
    if (data.sourceTabId === TAB_ID) return // 忽略自己发出的消息

    const callbacks = this.listeners.get(data.type)
    if (callbacks) {
      callbacks.forEach(cb => cb(data.payload))
    }
  }

  /**
   * 发送全局消息
   */
  publish(type: BroadcastType, payload: any) {
    if (!this.channel) return

    const message: BroadcastMessage = {
      type,
      payload,
      sourceTabId: TAB_ID
    }
    this.channel.postMessage(message)
  }

  /**
   * 订阅某种类型的消息
   */
  subscribe(type: BroadcastType, callback: (payload: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)?.add(callback)

    // 返回取消订阅函数
    return () => {
      this.listeners.get(type)?.delete(callback)
    }
  }
}

export const syncChannel = new NexusBroadcast()
