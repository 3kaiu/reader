/**
 * Network Optimizer - 网络优化工具
 * 提供请求重试、请求去重和网络条件检测
 */

import './optimizer/autostart'

export type { NetworkInfo, NetworkQuality, RequestOptimizationConfig } from './optimizer/types'
export { NetworkDetector } from './optimizer/networkDetector'
export { RequestOptimizer } from './optimizer/requestOptimizer'
export { networkDetector, requestOptimizer } from './optimizer/instances'
