/**
 * 🔋 Hardware Aware Scheduler
 * 感知设备物理状态（电量、热量、内存）以动态调整后台任务负荷
 */
import { logger } from '@/utils/logger'

export enum PowerMode {
  ULTRA_LOW = 'ULTRA_LOW', // 电量极低，必须停止一切非必要后台任务
  LOW = 'LOW',           // 电量较低或过热，挂起预取和重型 AI 任务
  NORMAL = 'NORMAL',     // 正常模式
  PERFORMANCE = 'PERF'   // 充电中或全速模式
}

interface ResourceQuota {
  mode: PowerMode
  maxConcurrentTasks: number
  syncIntervalMs: number
}

class HardwareScheduler {
  private static instance: HardwareScheduler
  private currentMode: PowerMode = PowerMode.NORMAL

  private constructor() {
    this.initMonitoring()
  }

  static getInstance(): HardwareScheduler {
    if (!HardwareScheduler.instance) {
      HardwareScheduler.instance = new HardwareScheduler()
    }
    return HardwareScheduler.instance
  }

  private async initMonitoring() {
    if (typeof navigator === 'undefined') return

    // 1. 电池状态监听
    if ('getBattery' in navigator) {
      const battery: any = await (navigator as any).getBattery()
      this.updateModeFromBattery(battery)
      battery.addEventListener('levelchange', () => this.updateModeFromBattery(battery))
      battery.addEventListener('chargingchange', () => this.updateModeFromBattery(battery))
    }

    // 2. 内存压力模拟 (Chrome 扩展 API)
    // performance.memory 在 Chrome 中可用
  }

  private updateModeFromBattery(battery: any) {
    const { level, charging } = battery

    if (charging) {
      this.currentMode = PowerMode.PERFORMANCE
    } else if (level < 0.15) {
      this.currentMode = PowerMode.ULTRA_LOW
    } else if (level < 0.35) {
      this.currentMode = PowerMode.LOW
    } else {
      this.currentMode = PowerMode.NORMAL
    }

    logger.debug(`[Hardware] PowerMode changed to: ${this.currentMode}`)
  }

  public getQuota(): ResourceQuota {
    switch (this.currentMode) {
      case PowerMode.ULTRA_LOW:
        return {
          mode: PowerMode.ULTRA_LOW,
          maxConcurrentTasks: 1,
          syncIntervalMs: 300000 // 5 分钟
        }
      case PowerMode.LOW:
        return {
          mode: PowerMode.LOW,
          maxConcurrentTasks: 2,
          syncIntervalMs: 60000 // 1 分钟
        }
      case PowerMode.PERFORMANCE:
        return {
          mode: PowerMode.PERFORMANCE,
          maxConcurrentTasks: 8,
          syncIntervalMs: 15000 // 15 秒
        }
      default:
        return {
          mode: PowerMode.NORMAL,
          maxConcurrentTasks: 4,
          syncIntervalMs: 30000
        }
    }
  }

  public get mode(): PowerMode {
    return this.currentMode
  }
}

export const hardwareScheduler = HardwareScheduler.getInstance()
