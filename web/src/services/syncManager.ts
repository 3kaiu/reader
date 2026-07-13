/**
 * Sync Manager - 全局同步任务调度中心
 * 负责协调所有后台同步任务，支持优先级、去重和防抖。
 */

import './sync-manager/autostart'

export { syncManager } from './sync-manager/instance'
