import type { BatteryManagerLike, NavigatorWithBattery } from './types'

export async function initializeBatteryMonitoring(
  onBatteryUpdate: (battery: BatteryManagerLike) => void
): Promise<void> {
  if (typeof navigator === 'undefined') {
    return
  }

  const batteryNavigator = navigator as NavigatorWithBattery
  if (typeof batteryNavigator.getBattery !== 'function') {
    return
  }

  const battery = await batteryNavigator.getBattery()
  onBatteryUpdate(battery)
  battery.addEventListener('levelchange', () => onBatteryUpdate(battery))
  battery.addEventListener('chargingchange', () => onBatteryUpdate(battery))
}
