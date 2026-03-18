/**
 * 🌐 P2P Sync Engine
 * 基于 WebRTC DataChannel 的局域网零服务器同步
 */
import { logger } from '../utils/logger'
import { nexusDB, StoreNames } from '../utils/db'
import { decode, encode } from '@/utils/msgpack'

export class P2PService {
  private peerConnection: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private static instance: P2PService

  private constructor() {
    // 监听网络状态，尝试发现对等端
  }

  static getInstance(): P2PService {
    if (!P2PService.instance) {
      P2PService.instance = new P2PService()
    }
    return P2PService.instance
  }

  /**
   * 初始化 P2P 连接（简化握手逻辑）
   */
  public async initConnection(iceServers: RTCIceServer[] = []) {
    this.peerConnection = new RTCPeerConnection({ iceServers })

    this.peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel)
    }
  }

  /**
   * 创建发送端通道
   */
  public createDataChannel(label: string = 'nexus-sync') {
    if (!this.peerConnection) return
    const channel = this.peerConnection.createDataChannel(label)
    this.setupDataChannel(channel)
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel

    this.dataChannel.onopen = () => {
      logger.info('🚀 P2P DataChannel Opened')
      this.syncInitialState()
    }

    this.dataChannel.onmessage = (event) => {
      const data = decode(new Uint8Array(event.data)) as any
      this.handleIncomingSync(data)
    }
  }

  /**
   * 同步当前状态到对等端
   */
  private async syncInitialState() {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return

    const progress = await nexusDB.getAll(StoreNames.PROGRESS)
    const payload = encode({
      type: 'FULL_SYNC',
      timestamp: Date.now(),
      data: progress
    })

    this.dataChannel.send(new Uint8Array(payload).buffer)
  }

  /**
   * 处理接收到的同步数据（初步 Last-Write-Wins 冲突处理）
   */
  private async handleIncomingSync(payload: any) {
    logger.debug(`[P2P] Received sync type: ${payload.type}`)

    if (payload.type === 'FULL_SYNC' || payload.type === 'INCREMENTAL') {
      const items = payload.data
      for (const item of items) {
        // 简单的 LWW 策略
        const existing: any = await nexusDB.get(StoreNames.PROGRESS, item.bookId)
        if (!existing || item.updatedAt > existing.updatedAt) {
          await nexusDB.put(StoreNames.PROGRESS, item)
        }
      }
    }
  }

  /**
   * 广播增量更新
   */
  public broadcastUpdate(item: any) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return

    const payload = encode({
      type: 'INCREMENTAL',
      timestamp: Date.now(),
      data: [item]
    })

    this.dataChannel.send(new Uint8Array(payload).buffer)
  }
}

export const p2pService = P2PService.getInstance()
