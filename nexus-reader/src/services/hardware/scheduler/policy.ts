import { PowerMode, type BatteryManagerLike, type ResourceQuota } from './types'

export function resolvePowerModeFromBattery(battery: BatteryManagerLike): PowerMode {
  const { level, charging } = battery

  if (charging) {
    return PowerMode.PERFORMANCE
  }

  if (level < 0.15) {
    return PowerMode.ULTRA_LOW
  }

  if (level < 0.35) {
    return PowerMode.LOW
  }

  return PowerMode.NORMAL
}

export function getQuotaForMode(mode: PowerMode): ResourceQuota {
  switch (mode) {
    case PowerMode.ULTRA_LOW:
      return {
        mode: PowerMode.ULTRA_LOW,
        maxConcurrentTasks: 1,
        syncIntervalMs: 300000,
      }
    case PowerMode.LOW:
      return {
        mode: PowerMode.LOW,
        maxConcurrentTasks: 2,
        syncIntervalMs: 60000,
      }
    case PowerMode.PERFORMANCE:
      return {
        mode: PowerMode.PERFORMANCE,
        maxConcurrentTasks: 8,
        syncIntervalMs: 15000,
      }
    default:
      return {
        mode: PowerMode.NORMAL,
        maxConcurrentTasks: 4,
        syncIntervalMs: 30000,
      }
  }
}
