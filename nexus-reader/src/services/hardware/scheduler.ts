/**
 * 🔋 Hardware Aware Scheduler
 * 感知设备物理状态（电量、热量、内存）以动态调整后台任务负荷
 */
import { logger } from '@/utils/logger'
import { initializeBatteryMonitoring } from './scheduler/monitoring'
import { getQuotaForMode, resolvePowerModeFromBattery } from './scheduler/policy'
import { PowerMode, type BatteryManagerLike, type ResourceQuota } from './scheduler/types'

export { PowerMode } from './scheduler/types'

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
    await initializeBatteryMonitoring(battery => {
      this.updateModeFromBattery(battery)
    })

    // 2. 内存压力模拟 (Chrome 扩展 API)
    // performance.memory 在 Chrome 中可用
  }

  private updateModeFromBattery(battery: BatteryManagerLike) {
    this.currentMode = resolvePowerModeFromBattery(battery)

    logger.debug(`[Hardware] PowerMode changed to: ${this.currentMode}`)
  }

  public getQuota(): ResourceQuota {
    return getQuotaForMode(this.currentMode)
  }

  public get mode(): PowerMode {
    return this.currentMode
  }
}

export const hardwareScheduler = HardwareScheduler.getInstance()
