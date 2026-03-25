export enum PowerMode {
  ULTRA_LOW = 'ULTRA_LOW',
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  PERFORMANCE = 'PERF',
}

export interface ResourceQuota {
  mode: PowerMode
  maxConcurrentTasks: number
  syncIntervalMs: number
}

export interface BatteryManagerLike {
  level: number
  charging: boolean
  addEventListener: (type: 'levelchange' | 'chargingchange', listener: () => void) => void
}

export interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManagerLike>
}
