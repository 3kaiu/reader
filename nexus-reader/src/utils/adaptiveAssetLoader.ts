/**
 * 🛠️ Adaptive Asset Loader
 * 根据硬件算力与电量配额动态裁剪加载项
 */
import { hardwareScheduler, PowerMode } from './hardwareScheduler'
import { logger } from './logger'

export class AdaptiveLoader {
  private static loadedModules: Set<string> = new Set()

  /**
   * 动态加载 Wasm 模块（带硬件检查）
   */
  static async loadHeavyModule(name: string, loaderFn: () => Promise<any>): Promise<any> {
    const quota = hardwareScheduler.getQuota()

    if (quota.mode === PowerMode.ULTRA_LOW) {
      logger.warn(`[Adaptive] Skipping heavy module ${name} due to ULTRA_LOW power mode.`)
      return null
    }

    try {
      const module = await loaderFn()
      this.loadedModules.add(name)
      return module
    } catch (e) {
      logger.error(`[Adaptive] Failed to load module ${name}`, e)
      throw e
    }
  }

  /**
   * 检查是否应当降级 UI 渲染
   */
  static shouldDegradeUI(): boolean {
    const quota = hardwareScheduler.getQuota()
    return quota.mode === PowerMode.ULTRA_LOW || quota.mode === PowerMode.LOW
  }

  /**
   * 获取视觉质量配置
   */
  static getVisualQuality() {
    if (this.shouldDegradeUI()) {
      return {
        enableShadows: false,
        enableAnimations: false,
        useMinimalistTheme: true,
        canvasAntiAliasing: false
      }
    }

    return {
      enableShadows: true,
      enableAnimations: true,
      useMinimalistTheme: false,
      canvasAntiAliasing: true
    }
  }
}
